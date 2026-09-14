# Arquitectura

## Capas

`domain` define entidades, propuestas estructuradas, estados, DAG, invariantes y Evidence Judge. `application` compone planning, scheduler, context packages, ownership, budget, repair, revisión y recuperación. Los `ports` separan AgentRuntime, ExecutionRunner y StateStore. Los adaptadores implementan Pi, SQLite, Git, Docker y verificación; CLI y extensión son presentación.

No se usa Pi para gestionar el estado global de una goal. Cada AgentRun tiene su propia AgentSession, binding y context package. El runtime Pi aporta autenticación, herramientas, streaming, eventos y sesiones; Perfect aporta aceptación, paralelismo, Git, permisos y terminación.

## Ruta de ejecución

Antes de consumir un intento de implementación se valida el binding. El scheduler selecciona tareas con dependencias aceptadas y recursos suficientes, aplicando semáforos globales, por cuenta y por rol. El ownership se adquiere atómicamente antes de escribir. Dos tareas pueden ejecutar llamadas de modelo a la vez, pero no escribir superficies superpuestas. Integración y comandos pesados están serializados.

Los workers no lanzan subagentes recursivos. El Planner propone el DAG; el controlador valida ciclos, coverage, contratos y routing. Replanificar produce una versión inmutable y preserva attempts/linajes. Si un productor cambia o falla, se invalidan sus consumidores transitivos; las tareas independientes aceptadas se conservan.

## Contexto

Los paquetes contienen goal/task, criterios, restricciones, manifiesto saneado, extractos con hashes, dependencias/versiones, contratos, fallos y evidencia. No heredan historias de otros workers. Lecturas adicionales son explícitas y acotadas por tamaño/líneas. Las reparaciones visuales reciben imágenes del fallo; las reviews reciben capturas y targets reales, independientes del relato del implementador.

## Persistencia

SQLite local, WAL y un escritor coordinador por workspace. Estado y eventos se actualizan en la misma transacción. Operaciones Git/containers tienen intents persistidos antes del efecto. Agent sessions JSONL y artifacts grandes se conservan fuera de SQLite y del repositorio fuente. `schema_version` rechaza bases de una versión futura.

No hay demonio obligatorio: una invocación foreground mantiene el loop. Otro proceso CLI puede consultar SQLite y solicitar pausa/abort. Un cierre requiere recuperación; no hay promesa de continuar trabajando después de que el proceso se detuvo.

## Binding y observabilidad

Role, provider, accountRef, auth, billingMode, model y reasoning son dimensiones separadas. El binding de un run es inmutable. Telemetry registra requests, modelo solicitado/serializado/reportado, reasoning solicitado/enviado/reportado, uso, retries y latencia con procedencia. Lo no observable queda ausente. La vista terminal diferencia solicitudes de invocaciones del Planner/Oracle y muestra resultados del último check por spec/revisión.

## Presupuestos

Defaults configurables y snapshot por goal. Reservas antes de cada request evitan que varios workers gasten simultáneamente una misma capacidad. Unknown no es cero; una request interrumpida conserva incertidumbre. No sumar reasoning a output dos veces. `hard` rechaza solicitudes visuales cuyo coste/token bound no pueda garantizarse. Subscriptions no se convierten a dólares de catálogo. Las cuotas de cuenta se comparten entre roles.
