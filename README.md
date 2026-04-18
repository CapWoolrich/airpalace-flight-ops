# ✈️ AirPalace Flight Ops

Sistema de programación de vuelos para aviación ejecutiva.

**Flota:** N35EA (Embraer Phenom 300E) · N540JL (Cessna Citation M2)

---

## 🚀 PASO A PASO: Subir a GitHub + Vercel

### PASO 1 — Crear cuenta de GitHub (si no tienes)

1. Ve a **https://github.com/signup**
2. Crea tu cuenta con tu correo

### PASO 2 — Crear repositorio en GitHub

1. Ve a **https://github.com/new**
2. Repository name: `airpalace-flight-ops`
3. Selecciona **Public**
4. **NO** marques ninguna casilla de abajo
5. Click **Create repository**
6. Deja esa página abierta, la necesitarás

### PASO 3 — Subir el código

**Opción A — Desde computadora (con Git instalado):**

```bash
# Descomprime el ZIP
unzip airpalace-flight-ops.zip
cd airpalace-flight-ops

# Inicializa y sube
git init
git add .
git commit -m "AirPalace Flight Ops v5"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/airpalace-flight-ops.git
git push -u origin main
```

**Opción B — Desde el navegador (sin instalar nada):**

1. En tu repositorio vacío en GitHub, click **"uploading an existing file"**
2. Arrastra TODOS los archivos de la carpeta descomprimida
3. Click **"Commit changes"**

### PASO 4 — Conectar con Vercel

1. Ve a **https://vercel.com** → Click **"Sign Up"** → **"Continue with GitHub"**
2. Autoriza Vercel en GitHub
3. Click **"Add New Project"**
4. Busca `airpalace-flight-ops` en la lista → Click **"Import"**
5. Framework Preset: debería detectar **Vite** automáticamente
6. Click **"Deploy"**
7. Espera 1-2 minutos ⏳
8. ¡Listo! Vercel te da una URL como: **https://airpalace-flight-ops.vercel.app**

### PASO 5 — Instalar como app en iPhone

1. Abre la URL de Vercel en **Safari**
2. Toca el botón **Compartir** (cuadro con flecha ↑)
3. Selecciona **"Agregar a pantalla de inicio"**
4. Se instala con ícono ✈️ como app nativa

---

## ✅ Actualizaciones automáticas

Cada vez que subas cambios a GitHub, Vercel **re-deploya automáticamente** en 1-2 minutos.

---

## 💾 Persistencia de datos

- ✅ Guarda vuelos, horarios y estado de flota en el navegador
- ✅ Persiste al cerrar y reabrir
- ✅ Funciona sin internet después de la primera carga
- ⚠️ Los datos se guardan POR dispositivo/navegador

---

## 🛠 Desarrollo local (opcional)

```bash
npm install
npm run dev
```

Abre **http://localhost:5173**

---

## 🌍 Catálogo global de aeropuertos (`airports_master` + `airport_aliases`)

### Import inicial (producción)

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export FAA_CSV_PATH="./data/faa/faa_airports.csv"

npm run airports:import_global_airports
npm run airports:import_faa_us_overlay
npm run airports:rebuild_airport_aliases
npm run airports:rebuild_airport_search_index
npm run airports:import_country_validations
```

### Refresh periódico (idempotente)

```bash
npm run airports:import_global_airports
npm run airports:import_faa_us_overlay
npm run airports:rebuild_airport_aliases
npm run airports:rebuild_airport_search_index
npm run airports:import_country_validations
npm run airports:report
```

### Qué valida `import_country_validations`

- Cobertura por país en **US, MX, CO, PE, JM, TC**.
- Búsquedas obligatorias operacionales:
  - Boston / BOS / KBOS
  - Tampa / TPA / KTPA
  - Aspen / ASE / KASE
  - Vail/Eagle / EGE / KEGE
  - Houston Hobby / HOU / KHOU
  - San Francisco / SFO / KSFO
  - Las Vegas / LAS / KLAS
  - San Antonio / SAT / KSAT
  - Ocho Rios / Boscobel / Ian Fleming / OCJ / MKBS
  - Providenciales / Provo / PLS / MBPV
  - Grand Turk / JAGS McCartney / GDT / MBGT

Si falta cualquier hit obligatorio, el script termina con error.
