# Porción jugable + Beam gratuito

Fixture de Game Creator: controles de teclado/botones, objetivo, victoria, derrota y reinicio. Utiliza React DOM y la versión publicada border-beam 1.3.0, con su API de wrapper. No contiene Studio, presets ni contenido Pro de Libraries.dev. Se corrigió el pin 1.4.0 porque esa versión declarada en el repositorio no estaba publicada en npm al ejecutar la prueba.

La prueba de navegador hace partidas reales en 390×844 y 1280×800 y repite con reduced-motion, desactivando Beam. No utiliza cuentas ni decisiones de modelos reales. Es un escenario reproducible de herramientas y jugabilidad, no una evaluación de creatividad de un LLM.

Con dependencias instaladas, npm test comprueba reglas y npm start construye el bundle y sirve la app. No tiene backend porque es offline. Perfect prepara dependencias explícitamente y verifica en contenedores sin red pública durante la ejecución.
