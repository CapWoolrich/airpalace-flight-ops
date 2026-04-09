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
