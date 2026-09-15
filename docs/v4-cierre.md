# Cierre V4: aceptación y evidencia

Base verificada: PR #4, rama feat/perfect-harness-v4-skills-studios, HEAD 1f3876b481a10c096ec7423541696ecd2a603306. Los hitos anteriores no sustituyen el CI final. El Docker permanente omitía preparar PostgreSQL; esta entrega debe corregir el entorno, no omitir la prueba.

| Área | Implementación requerida | Evidencia de cierre |
|---|---|---|
| Manual | Selección de versión/hash, equipos y revocación | Pruebas de contexto y Pi real con transporte sintético |
| Creador y A/B | Borrador, cuarentena, evaluación aislada y decisión de usuario | Recorrido integrado y casos de ambos-fallan/regresión |
| Blender | Creación, reapertura separada, GLB y render aislados | Blender real, loader y artifacts |
| Interfaz | Formularios y recorridos españoles | Capturas nativas/OS claramente diferenciadas |
| CI | Entornos limpios y SHA exacto | Jobs permanentes y manifests de ejecución |
| Windows | Instalador/portable, actualización y desinstalación | Binario instalado, versión/hash y conservación de datos |
| Validación personal | Centro de capacidades y smoke local autorizado | Reporte por cuenta/editor, sin confundir mocks con inferencias |

El entorno de contenedor de esta conversación no respondió al inicio. Se utiliza el conector de GitHub y una única preparación de código revisada con gates de Actions; el árbol final no debe depender de scripts temporales. Ninguna credencial personal se utiliza para CI.
