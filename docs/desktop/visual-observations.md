# Observaciones visuales locales de la evidencia

La generación o decodificación de un PNG/video no constituye revisión visual. Cuando el entorno de conversación no puede abrir los archivos, el job `visual-observations` puede proporcionar una segunda fuente de observaciones a partir de los píxeles reales.

Este job es una herramienta de desarrollo, no una dependencia de Perfect ni del instalador. Descarga el modelo público Apache-2.0 `Qwen/Qwen3-VL-4B-Instruct` en la revisión `ebb281ec70b05090aa6165b016eac8ec08e71b17`, ejecuta Transformers/PyTorch en CPU y conserva versiones, hashes de pesos, imágenes, prompts, tokens, respuestas y tiempos. No llama APIs de inferencia, no usa cuentas personales y no envía las capturas a un proveedor. Los pesos se descargan desde Hugging Face; después se bloquea la red del proceso de revisión.

Se revisan ocho capturas representativas y cinco fotogramas de cada uno de los cuatro videos decodificados. El muestreo no demuestra lo que ocurrió entre fotogramas ni certifica fluidez. Las pruebas de interacción, el informe de instalación y la medición de animaciones son evidencias independientes.

La salida es `OBSERVATIONS_READY_NOT_APPROVAL`, nunca una aprobación de release. Puede contener errores, omisiones o hallazgos inciertos. Debe contrastarse con la evidencia funcional y revisarse críticamente. No modifica los criterios de aceptación, no crea el comentario de aprobación del propietario, no fusiona y no publica. Una respuesta malformada o una ejecución interrumpida no se convierten en PASS.

La fuente del runtime es https://huggingface.co/docs/transformers/model_doc/qwen3_vl y la licencia/revisión se consultan en https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct. Los paquetes y el modelo quedan fijados; sus archivos no se incluyen en los artifacts de distribución.
