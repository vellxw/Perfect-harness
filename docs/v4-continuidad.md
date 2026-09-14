# Base de V4

V4 se apila sobre la V3 `ce714632698ea92cfb3b45e809065b34304f8983`; no se fusionan las PR anteriores. Se recupera el árbol `d8fbdad643622ccffaffba4d54b9987ca15f23f5` que el workflow V3 34897457854 produjo con ajustes pendientes de publicación, incluidos cancelación, argumentos nativos, errores y versión 0.3.0. Su prevalidación no se toma como resultado de CI de V4: la rama nueva ejecuta las regresiones nuevamente. Los dos workflows de publicación/diagnóstico V3 y sus scripts temporales se retiran del árbol activo. Se conserva todo su historial Git.

Las validaciones de esta entrega se documentarán por SHA exacto. Ninguna prueba con servidores/modelos sintéticos valida cuentas personales, Unity Editor, Adobe, Rive o Cavalry. Los límites de licencia no se eliminan para lograr un estado verde.
