create extension if not exists "pgcrypto";

create table if not exists roles (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists usuarios (
  id bigserial primary key,
  username text not null unique,
  nombre_completo text not null,
  telefono text not null,
  rol_id bigint not null references roles(id),
  barrio_id bigint references barrios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists barrios (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists tipos_ayuda (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists motivos_ayuda (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists beneficiarios (
  id bigserial primary key,
  nombre text not null,
  apellido text not null,
  dni text not null unique,
  telefono text not null,
  fecha_nacimiento date,
  integrantes_familia int not null check (integrantes_familia >= 1),
  barrio_id bigint not null references barrios(id),
  observaciones text not null default '',
  activo boolean not null default true,
  creado_en date not null default current_date,
  actualizado_en timestamptz not null default now()
);

create table if not exists ayudas (
  id bigserial primary key,
  beneficiario_id bigint not null references beneficiarios(id),
  tipo_ayuda_id bigint not null references tipos_ayuda(id),
  motivo_ayuda_id bigint not null references motivos_ayuda(id),
  cantidad int not null check (cantidad >= 1),
  fecha_ayuda date not null default current_date,
  observaciones text not null default '',
  usuario_id bigint references usuarios(id),
  tipo_otro text not null default '',
  motivo_otro text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists auditoria (
  id bigserial primary key,
  fecha_hora timestamptz not null default now(),
  usuario_id bigint references usuarios(id),
  username text not null default 'sistema',
  modulo text not null,
  accion text not null,
  detalle text not null default '',
  valor_anterior jsonb,
  valor_nuevo jsonb
);

create index if not exists idx_beneficiarios_barrio on beneficiarios(barrio_id);
create index if not exists idx_beneficiarios_activo on beneficiarios(activo);
create index if not exists idx_ayudas_beneficiario on ayudas(beneficiario_id);
create index if not exists idx_ayudas_fecha on ayudas(fecha_ayuda);
create index if not exists idx_ayudas_tipo on ayudas(tipo_ayuda_id);
create index if not exists idx_ayudas_motivo on ayudas(motivo_ayuda_id);
create index if not exists idx_auditoria_fecha on auditoria(fecha_hora desc);
create index if not exists idx_auditoria_modulo on auditoria(modulo);

insert into roles (id, nombre, activo) values
  (1, 'Administrador', true),
  (2, 'Operador', true),
  (3, 'Consulta', true)
on conflict (id) do update set nombre = excluded.nombre, activo = excluded.activo;

insert into usuarios (id, username, nombre_completo, telefono, rol_id, barrio_id, activo) values
  (1, 'admin', 'Administrador General', '2804000001', 1, 10, true),
  (2, 'operador01', 'Operador de Asistencia', '2804000002', 2, 11, true),
  (3, 'consulta01', 'Usuario de Consulta', '2804000003', 3, 12, true)
on conflict (id) do update set
  username = excluded.username,
  nombre_completo = excluded.nombre_completo,
  telefono = excluded.telefono,
  rol_id = excluded.rol_id,
  barrio_id = excluded.barrio_id,
  activo = excluded.activo,
  actualizado_en = now();

insert into barrios (id, nombre, activo) values
  (10, 'Centro', true),
  (11, 'Norte', true),
  (12, 'Sur', true),
  (13, 'Oeste', true),
  (14, 'Rural', true)
on conflict (id) do update set nombre = excluded.nombre, activo = excluded.activo, actualizado_en = now();

insert into tipos_ayuda (id, nombre, activo) values
  (20, 'Chapas', true),
  (21, 'Alimentos', true),
  (22, 'Colchones', true),
  (23, 'Materiales', true),
  (24, 'Medicamentos', true),
  (25, 'Otros', true)
on conflict (id) do update set nombre = excluded.nombre, activo = excluded.activo, actualizado_en = now();

insert into motivos_ayuda (id, nombre, activo) values
  (30, 'Emergencia', true),
  (31, 'Salud', true),
  (32, 'Vivienda', true),
  (33, 'Inundacion', true),
  (34, 'Situacion economica', true),
  (35, 'Otros', true)
on conflict (id) do update set nombre = excluded.nombre, activo = excluded.activo, actualizado_en = now();

insert into beneficiarios (id, nombre, apellido, dni, telefono, fecha_nacimiento, integrantes_familia, barrio_id, observaciones, activo, creado_en) values
  (100, 'Mariana', 'Paredes', '30111222', '2804551001', '1988-04-12', 4, 10, 'Familia con asistencia alimentaria recurrente.', true, '2026-08-01'),
  (101, 'Luis', 'Arce', '28777111', '2804551002', '1979-09-20', 2, 12, 'Solicito materiales por emergencia habitacional.', true, '2026-08-02'),
  (102, 'Camila', 'Rios', '41999888', '2804551003', '2001-01-15', 3, 11, '', true, '2026-08-03'),
  (103, 'Jorge', 'Molina', '25000123', '2804551004', '1968-07-30', 1, 13, 'Inactivo por cambio de domicilio.', false, '2026-07-28')
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
  actualizado_en = now();

insert into ayudas (id, beneficiario_id, tipo_ayuda_id, motivo_ayuda_id, cantidad, fecha_ayuda, observaciones, usuario_id) values
  (150, 100, 21, 34, 8, current_date, 'Entrega mensual', 2),
  (151, 101, 20, 32, 12, current_date, 'Reparacion de techo', 2),
  (152, 102, 22, 30, 2, '2026-08-03', 'Emergencia familiar', 1)
on conflict (id) do update set
  beneficiario_id = excluded.beneficiario_id,
  tipo_ayuda_id = excluded.tipo_ayuda_id,
  motivo_ayuda_id = excluded.motivo_ayuda_id,
  cantidad = excluded.cantidad,
  fecha_ayuda = excluded.fecha_ayuda,
  observaciones = excluded.observaciones,
  usuario_id = excluded.usuario_id,
  actualizado_en = now();

select setval(pg_get_serial_sequence('roles', 'id'), greatest((select max(id) from roles), 1), true);
select setval(pg_get_serial_sequence('usuarios', 'id'), greatest((select max(id) from usuarios), 1), true);
select setval(pg_get_serial_sequence('barrios', 'id'), greatest((select max(id) from barrios), 1), true);
select setval(pg_get_serial_sequence('tipos_ayuda', 'id'), greatest((select max(id) from tipos_ayuda), 1), true);
select setval(pg_get_serial_sequence('motivos_ayuda', 'id'), greatest((select max(id) from motivos_ayuda), 1), true);
select setval(pg_get_serial_sequence('beneficiarios', 'id'), greatest((select max(id) from beneficiarios), 1), true);
select setval(pg_get_serial_sequence('ayudas', 'id'), greatest((select max(id) from ayudas), 1), true);
