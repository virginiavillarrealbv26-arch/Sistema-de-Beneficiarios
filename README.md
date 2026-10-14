# Sistema de Gestion de Beneficiarios y Ayudas

Aplicacion web creada a partir del documento funcional `DOCUMENTO COMPLETO_CORREGIDO_FINAL.docx`.

## Como usar con backend y Supabase

1. Cree un proyecto en Supabase.
2. Abra el SQL Editor de Supabase y ejecute `supabase/schema.sql`.
3. Copie `.env.example` como `.env`.
4. Complete `DATABASE_URL` con la cadena PostgreSQL de Supabase.
5. Instale dependencias:

```bash
npm install
```

6. Inicie el sistema:

```bash
npm start
```

7. Abra `http://127.0.0.1:8097`.

El frontend consume `/api/state`. Si la base no esta configurada, la app conserva un modo de respaldo en `localStorage`.

## Como usar sin backend

Abra `index.html` directamente en el navegador. En ese modo la informacion queda guardada solo en `localStorage`.

## Funciones incluidas

- Dashboard con indicadores generales, ayudas por tipo y ayudas por barrio.
- Gestion de beneficiarios con DNI unico, edad minima, grupo familiar obligatorio y baja logica.
- Registro y modificacion de ayudas con tipo, motivo, cantidad, fecha, observaciones y responsable.
- Categorias administrables: barrios, tipos de ayuda y motivos.
- Usuarios con roles Administrador, Operador y Consulta.
- Auditoria automatica de altas, modificaciones, cambios de estado, exportaciones y seguridad.
- Reportes filtrables por periodo y exportacion CSV.
- Backend Node/Express.
- Esquema Supabase/PostgreSQL con tablas, relaciones, indices y datos iniciales.

## Datos iniciales

La base carga datos iniciales desde `supabase/schema.sql`. En modo local, la app carga datos de demostracion la primera vez. Use `Restaurar demo` para reiniciar los datos visibles y sincronizarlos con la API cuando este disponible.
