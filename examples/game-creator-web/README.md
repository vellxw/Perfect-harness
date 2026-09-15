# Porción jugable + Beam gratuito

Fixture de prueba de Game Creator: controles de teclado/botones, objetivo, victoria, derrota y reinicio. Utiliza React DOM y la biblioteca pública border-beam 1.4.0. No contiene Studio, presets ni contenido Pro de Libraries.dev.

La prueba de navegador hace partidas reales en 390×844 y 1280×800 y repite con reduced-motion. No utiliza servicios de cuentas ni decisiones de modelos reales. Es un escenario reproducible para las herramientas, no una evaluación de creatividad de un LLM.

Con dependencias instaladas, `npm test` comprueba reglas y `npm start` construye el bundle y sirve la app. No tiene backend porque es offline. Perfect prepara dependencias y verifica dentro de contenedores sin red pública durante la ejecución.
