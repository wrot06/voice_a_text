# Política de Privacidad - Voz a Texto (Transcriptor de Audio y Micrófono)

**Última actualización:** 9 de septiembre de 2026

Esta Política de Privacidad describe cómo la extensión de Chrome **"Voz a Texto - Transcriptor de Audio y Micrófono"** (en adelante, "la Extensión") maneja, procesa y protege la información y datos de los usuarios.

---

## 1. Información que Recopilamos y Procesamos

La Extensión está diseñada respetando la privacidad del usuario. Los permisos solicitados se utilizan de manera estricta para el funcionamiento de la herramienta:

### a) Micrófono y Entrada de Audio
* **Uso:** La Extensión solicita acceso al micrófono de tu dispositivo únicamente cuando activas el botón de grabación o el comando de voz para realizar transcripciones de voz a texto.
* **Procesamiento:** El audio capturado por el micrófono se procesa a través de la API estándar de reconocimiento de voz del navegador (`Web Speech API`). 
* **Almacenamiento:** Ningún archivo ni fragmento de audio es grabado, grabado en segundo plano ni transmitido o almacenado en servidores externos o propietarios.

### b) Archivos de Audio y Video Locales
* **Uso:** Cuando utilizas la función de transcribir archivos (archivos `.mp3`, `.wav`, `.mp4`, etc.), el archivo es reproducido y procesado localmente en tu navegador para generar el texto correspondiente.
* **Almacenamiento:** La Extensión no sube ni guarda tus archivos multimedia en servidores externos.

### c) Datos de Almacenamiento Local (`chrome.storage` / `localStorage`)
* **Uso:** La Extensión utiliza el almacenamiento local del navegador para guardar:
  - Preferencias de usuario (idioma seleccionado, puntuación inteligente, atajos de teclado, tamaño de letra).
  - Historial de transcripciones generadas.
* **Privacidad:** Estos datos se quedan almacenados exclusivamente de forma local en tu dispositivo y puedes borrarlos en cualquier momento desde las opciones de la Extensión.

---

## 2. Compartición y Venta de Datos (Terceros)

* **No Venta de Datos:** No vendemos, alquilamos, comercializamos ni transferimos datos personales ni información de voz a terceros.
* **Sin Rastreo / Analytics de Terceros:** La Extensión no utiliza scripts de seguimiento de terceros, rastreadores ni redes publicitarias.

---

## 3. Cumplimiento de Políticas de Chrome Web Store

La Extensión cumple con la Política de Datos de Usuario del Programa de Desarrolladores de Chrome Web Store:
- Solo solicitamos los permisos mínimos necesarios (`storage` y acceso a dispositivos de audio al interactuar).
- El uso de los datos personales recopilados se limita estrictamente a proporcionar las funcionalidades principales declaradas de la extensión.

---

## 4. Retención y Eliminación de Datos

Todos los datos generados (historial de transcripciones y preferencias) permanecen bajo tu control directo en tu navegador. Puedes borrar el historial de transcripciones en cualquier momento utilizando el botón **"Limpiar Historial"** dentro de la interfaz de la Extensión o desinstalando la Extensión.

---

## 5. Contacto

Si tienes alguna duda o pregunta sobre esta Política de Privacidad, puedes ponerte en contacto con el desarrollador a través del correo de soporte habilitado en la ficha de Chrome Web Store.
