# Smoke local

## Sin cuentas

Con Node 24, Git y las imágenes Docker del README:

```sh
perfect smoke --fullstack --mock --accept-plan
```

Esperado: `mode: mock`, dos writers en paralelo, role bindings `perfect-mock`, API validada/persistente, primera captura móvil rechazada por overflow, repair con capturas y última revisión aceptada por el Judge. Los reviewers aquí son guionados; no afirmar que un LLM vio las imágenes.

## Con tus cuentas

```sh
perfect login xai
perfect login openai-codex
perfect login opencode
perfect doctor --online
perfect smoke --allow-contributor
perfect smoke --fullstack --accept-plan --allow-contributor
```

La inferencia mínima prueba salida estructurada, herramienta, imagen para rutas multimodales y auditoría de payload/metadata. Se puede aislar con `--role frontend`. No proporcionar credenciales por chat. Un modelo en el catálogo pero no habilitado para la cuenta debe producir BLOCKED/UNCONFIGURED, nunca un fallback.

El fullstack real crea un workspace sintético temporal y exige los roles. Si falla por cuota, auth, incompatibilidad o límites de revisión, conservar el reporte; no afirmar DONE. El consentimiento de estos comandos aplica al contenido sintético del smoke, no a cualquier proyecto privado.

## Entorno

`PERFECT_HOME` o `--home` separa el perfil. No ejecutar el smoke dentro de una carpeta con credenciales de producción para “ayudar” al agente: el sandbox no debe recibirlas. No copiar el perfil a Actions.
