# Visual repair

El smoke Reservations introduce una anchura fija incorrecta en la primera implementación móvil. El verificador JavaScript pasa, la API pasa, pero Playwright detecta overflow a 390×844. Se crea repair con screenshots, se corrige CSS, se captura de nuevo y el Judge solo acepta el candidato integrado revalidado.

El comportamiento está comprobado por `tests/e2e/fullstack.test.ts`, no por una animación fingida de mensajes. Review de mock no equivale a juicio visual real de un LLM.
