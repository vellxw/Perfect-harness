# Instalación y ejecución en Windows

## Paquetes

La versión 0.2.1 ofrece `Perfect-Harness-Setup-x64.exe` con instalador en español, un ZIP portable completo `Perfect-Harness-Windows-x64.zip` y `SHA256SUMS.txt`. El flujo **Windows package** también publica un archivo independiente llamado **Perfect-Windows-x64-Espanol-Instalador**, para no descargar ambas distribuciones juntas.

La instalación es por usuario, sin elevar privilegios. Crea una entrada en Inicio, un acceso opcional al escritorio y el perfil de Windows Terminal. Añadir Perfect al PATH es opcional y reversible. El paquete incluye Node y sus dependencias: `Perfect.exe` no es un ejecutable autónomo que pueda copiarse sin el resto de su carpeta.

Windows Terminal es necesario para la ventana visual dedicada. Git y un motor Docker con contenedores Linux siguen siendo requisitos para ejecutar código de proyectos. No se instalan sin permiso ni se ejecutan comandos directamente en el equipo cuando falta el entorno aislado.

## Abrir un proyecto

```powershell
perfect --carpeta "C:\Proyectos\Mi aplicación"
```

Desde la interfaz, `/carpeta` permite indicar el proyecto original. El acceso directo conserva la ubicación predeterminada `Documents\Perfect Projects\Workspace`; la traducción no mueve proyectos ni cambia rutas persistidas. Los nombres de comandos originales, como `--workspace`, siguen siendo válidos.

## Integración con Windows Terminal

La instalación utiliza `%LOCALAPPDATA%\Programs\PerfectHarness`. Su fragmento propio se registra en `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\PerfectHarness\PerfectHarness.json` con una identidad fija.

El perfil proporciona icono, título, fuente monoespaciada, fondo oscuro, opacidad 88, Acrylic y un fondo original discreto. Mica depende de la configuración personal de Windows Terminal y no se activa globalmente. La aplicación no reescribe `settings.json`.

La desinstalación elimina únicamente su fragmento si corresponde a esta instalación y la entrada de PATH que añadió. No elimina proyectos, estado del motor ni credenciales locales. La versión española conserva el AppId y las carpetas de instalación para mantener continuidad con 0.2.0.

## Arquitectura del paquete

Se utiliza un iniciador C# x64 pequeño sobre .NET Framework, junto con Node 26.4.0 y las dependencias normales. Se eligió esta distribución para conservar los recursos dinámicos de Pi y los recursos nativos de OpenTUI, sin imponer una conversión a SEA o Bun que no estuviera validada.

El ejecutable incluye metadatos de versión, icono, declaración de DPI, compatibilidad con rutas largas y ejecución sin elevación (`asInvoker`). Los argumentos se transmiten de forma explícita; no se concatenan en una orden de PowerShell o cmd. La interfaz se comunica con el proceso del motor mediante un canal IPC privado.

## Compilar y probar

En una máquina Windows x64 con las herramientas de compilación:

```powershell
npm ci
./scripts/package-windows.ps1 -Installer
./scripts/smoke-windows.ps1 -Installer
```

El script verifica versión y metadatos contra `package.json`, icono, perfil de Windows Terminal y ejecución sin Node global. Las pruebas de instalación usan una carpeta temporal, comprueban ayuda y opciones españolas, salida JSON, PATH y desinstalación. Las claves de JSON y los identificadores del protocolo no cambian con el idioma.

El diagnóstico instalado se puede ejecutar con:

```powershell
perfect diagnostico
perfect diagnostico --en-linea
```

El primero no envía inferencias; el segundo puede comprobar o renovar credenciales, pero tampoco demuestra por sí solo acceso a modelos o cuota disponible. Las pruebas con cuentas personales se solicitan por separado.

## Firma y distribución

Los ejecutables están **sin firma Authenticode**. SHA256 verifica integridad, no la identidad del editor. No desactives protecciones de Windows. Una publicación firmada requiere un certificado y un proceso de firma externo; no se incluyen PFX, claves privadas ni credenciales en el repositorio o en CI.

## Qué demuestra CI

El ejecutable y el instalador se compilan y ejecutan en **Windows Server 2025 build 26100**. Eso no equivale a una certificación de una sesión personal de Windows 11.

La captura de escritorio usa una distribución verificada de Windows Terminal en un entorno aislado, confirma que el proceso de la interfaz siga vivo y registra el sistema, tamaño y método. Si no existe un escritorio interactivo utilizable, informa `BLOCKED`, no una captura inventada. Las escenas de demostración no usan cuentas personales.

La aceptación final en Windows 11 —teclado, transparencia y ejecución real con Docker— sigue siendo una comprobación local. El idioma de errores emitidos por Windows Terminal, Docker o servicios externos depende de esos programas; Perfect conserva su información original cuando no hay una traducción conocida.
