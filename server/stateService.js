const { query, transaction } = require("./db");

async function getState() {
  const [roles, users, barrios, tipos, motivos, beneficiaries, aids, audit] = await Promise.all([
    query("select id, nombre, activo from roles order by id"),
    query(`
      select u.id, u.username, u.nombre_completo, u.telefono, u.activo, u.barrio_id, r.nombre as rol
      from usuarios u
      join roles r on r.id = u.rol_id
      order by u.id
    `),
    query("select id, nombre, activo from barrios order by nombre"),
    query("select id, nombre, activo from tipos_ayuda order by nombre"),
    query("select id, nombre, activo from motivos_ayuda order by nombre"),
    query(`
      select id, nombre, apellido, dni, telefono, fecha_nacimiento, integrantes_familia,
             barrio_id, observaciones, activo, creado_en
      from beneficiarios
      order by apellido, nombre
    `),
    query(`
      select id, beneficiario_id, tipo_ayuda_id, motivo_ayuda_id, cantidad, fecha_ayuda,
             observaciones, usuario_id, tipo_otro, motivo_otro, creado_en
      from ayudas
      order by fecha_ayuda desc, id desc
    `),
    query(`
      select id, fecha_hora, usuario_id, username, modulo, accion, detalle, valor_anterior, valor_nuevo
      from auditoria
      order by fecha_hora desc, id desc
      limit 500
    `)
  ]);

  return {
    nextId: calculateNextId([roles.rows, users.rows, barrios.rows, tipos.rows, motivos.rows, beneficiaries.rows, aids.rows, audit.rows]),
    currentUserId: users.rows[0]?.id || 1,
    users: users.rows.map((row) => ({
      id: Number(row.id),
      username: row.username,
      fullName: row.nombre_completo,
      phone: row.telefono,
      role: row.rol,
      barrioId: row.barrio_id ? Number(row.barrio_id) : null,
      active: row.activo
    })),
    barrios: mapCatalog(barrios.rows),
    tipos: mapCatalog(tipos.rows),
    motivos: mapCatalog(motivos.rows),
    beneficiaries: beneficiaries.rows.map((row) => ({
      id: Number(row.id),
      name: row.nombre,
      lastName: row.apellido,
      dni: row.dni,
      phone: row.telefono,
      birthDate: dateOnly(row.fecha_nacimiento),
      familySize: Number(row.integrantes_familia),
      barrioId: Number(row.barrio_id),
      notes: row.observaciones || "",
      active: row.activo,
      createdAt: dateOnly(row.creado_en)
    })),
    aids: aids.rows.map((row) => ({
      id: Number(row.id),
      beneficiaryId: Number(row.beneficiario_id),
      typeId: Number(row.tipo_ayuda_id),
      reasonId: Number(row.motivo_ayuda_id),
      quantity: Number(row.cantidad),
      aidDate: dateOnly(row.fecha_ayuda),
      notes: row.observaciones || "",
      userId: row.usuario_id ? Number(row.usuario_id) : null,
      typeOther: row.tipo_otro || "",
      reasonOther: row.motivo_otro || "",
      createdAt: row.creado_en ? new Date(row.creado_en).toISOString() : new Date().toISOString()
    })),
    audit: audit.rows.map((row) => ({
      id: Number(row.id),
      timestamp: row.fecha_hora ? new Date(row.fecha_hora).toISOString() : new Date().toISOString(),
      userId: row.usuario_id ? Number(row.usuario_id) : 0,
      username: row.username,
      module: row.modulo,
      action: row.accion,
      detail: row.detalle,
      before: row.valor_anterior,
      after: row.valor_nuevo
    }))
  };
}

async function syncState(state) {
  await transaction(async (client) => {
    await upsertRoles(client, ["Administrador", "Operador", "Consulta"]);
    await upsertUsers(client, state.users || []);
    await upsertCatalog(client, "barrios", state.barrios || []);
    await upsertCatalog(client, "tipos_ayuda", state.tipos || []);
    await upsertCatalog(client, "motivos_ayuda", state.motivos || []);
    await upsertBeneficiaries(client, state.beneficiaries || []);
    await upsertAids(client, state.aids || []);
    await upsertAudit(client, state.audit || []);
  });
  return getState();
}

async function upsertRoles(client, names) {
  for (const [index, name] of names.entries()) {
    await client.query(
      `insert into roles (id, nombre, activo)
       values ($1, $2, true)
       on conflict (id) do update set nombre = excluded.nombre, activo = true`,
      [index + 1, name]
    );
  }
}

async function upsertUsers(client, users) {
  for (const user of users) {
    const role = await client.query("select id from roles where nombre = $1", [user.role || "Consulta"]);
    await client.query(
      `insert into usuarios (id, username, nombre_completo, telefono, rol_id, activo, barrio_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         username = excluded.username,
         nombre_completo = excluded.nombre_completo,
         telefono = excluded.telefono,
         rol_id = excluded.rol_id,
         activo = excluded.activo,
         barrio_id = excluded.barrio_id,
         actualizado_en = now()`,
      [user.id, user.username, user.fullName, user.phone, role.rows[0]?.id || 3, Boolean(user.active), user.barrioId || null]
    );
  }
}

async function upsertCatalog(client, table, rows) {
  for (const item of rows) {
    await client.query(
      `insert into ${table} (id, nombre, activo)
       values ($1, $2, $3)
       on conflict (id) do update set
         nombre = excluded.nombre,
         activo = excluded.activo,
         actualizado_en = now()`,
      [item.id, item.name, Boolean(item.active)]
    );
  }
}

async function upsertBeneficiaries(client, beneficiaries) {
  for (const beneficiary of beneficiaries) {
    await client.query(
      `insert into beneficiarios
       (id, nombre, apellido, dni, telefono, fecha_nacimiento, integrantes_familia, barrio_id, observaciones, activo, creado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set
         nombre = excluded.nombre,
         apellido = excluded.apellido,
         dni = excluded.dni,
         telefono = excluded.telefono,
         fecha_nacimiento = excluded.fecha_nacimiento,
         integrantes_familia = excluded.integrantes_familia,
         barrio_id = excluded.barrio_id,
         observaciones = excluded.observaciones,
         activo = excluded.activo,
         creado_en = excluded.creado_en,
         actualizado_en = now()`,
      [
        beneficiary.id,
        beneficiary.name,
        beneficiary.lastName,
        beneficiary.dni,
        beneficiary.phone,
        beneficiary.birthDate || null,
        beneficiary.familySize,
        beneficiary.barrioId,
        beneficiary.notes || "",
        Boolean(beneficiary.active),
        beneficiary.createdAt || new Date().toISOString().slice(0, 10)
      ]
    );
  }
}

async function upsertAids(client, aids) {
  for (const aid of aids) {
    await client.query(
      `insert into ayudas
       (id, beneficiario_id, tipo_ayuda_id, motivo_ayuda_id, cantidad, fecha_ayuda, observaciones, usuario_id, tipo_otro, motivo_otro, creado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set
         beneficiario_id = excluded.beneficiario_id,
         tipo_ayuda_id = excluded.tipo_ayuda_id,
         motivo_ayuda_id = excluded.motivo_ayuda_id,
         cantidad = excluded.cantidad,
         fecha_ayuda = excluded.fecha_ayuda,
         observaciones = excluded.observaciones,
         usuario_id = excluded.usuario_id,
         tipo_otro = excluded.tipo_otro,
         motivo_otro = excluded.motivo_otro,
         creado_en = excluded.creado_en,
         actualizado_en = now()`,
      [
        aid.id,
        aid.beneficiaryId,
        aid.typeId,
        aid.reasonId,
        aid.quantity,
        aid.aidDate,
        aid.notes || "",
        aid.userId || null,
        aid.typeOther || "",
        aid.reasonOther || "",
        aid.createdAt || new Date().toISOString()
      ]
    );
  }
}

async function upsertAudit(client, auditRows) {
  const limitedRows = auditRows.slice(0, 500);
  for (const entry of limitedRows) {
    await client.query(
      `insert into auditoria
       (id, fecha_hora, usuario_id, username, modulo, accion, detalle, valor_anterior, valor_nuevo)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       on conflict (id) do nothing`,
      [
        Number.isFinite(Number(entry.id)) ? Math.floor(Number(entry.id)) : Date.now(),
        entry.timestamp || new Date().toISOString(),
        entry.userId || null,
        entry.username || "sistema",
        entry.module || "Sistema",
        entry.action || "Accion",
        entry.detail || "",
        JSON.stringify(entry.before || null),
        JSON.stringify(entry.after || null)
      ]
    );
  }
}

function mapCatalog(rows) {
  return rows.map((row) => ({ id: Number(row.id), name: row.nombre, active: row.activo }));
}

function calculateNextId(groups) {
  const maxId = groups.flat().reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  return maxId + 1;
}

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

module.exports = { getState, syncState };
