# Qué queda pendiente

Última actualización: 29 de septiembre de 2026.

---

## 1. Lo que está hecho pero NO publicado

Vercel dejó de publicar al tocar el techo de **100 publicaciones cada 24 horas** del plan
gratuito. El código está subido y compila; solo falta que se publique.

La aplicación está sirviendo `e3b4225`. Esperan a publicarse:

| Commit | Qué trae |
|---|---|
| `565a0e9` | Fotos de perfil de Slack · barra de editar/borrar bien colocada · recuadro de editar ancho · fuera el botón de transcribir |
| `1978693` | Añadir tareas desde *Mi trabajo* (texto + cliente + día) |

**Lo primero de mañana:** comprobar en <https://vercel.com/21-days1/bitacora/deployments> que hay
un despliegue nuevo desde `main` marcado *Production*. Si no, promoverlo a mano (`⋯` →
*Promote to Production*). Se sabe que está al día porque abajo a la izquierda, debajo del nombre,
sale el código de la versión.

**Ya corregido por mi parte:** cada cambio se subía a tres ramas, o sea tres publicaciones por
arreglo. Ahora va solo a `main`. Eso reduce el consumo a la tercera parte.

---

## 2. La decisión que hay que tomar

**¿Plan gratuito o Pro (20 $/mes)?**

Con el gratuito seguiremos chocando con dos topes:

- **100 publicaciones cada 24 horas.** Nos ha parado dos días seguidos.
- **50 MB por archivo** en las subidas — este viene de Supabase, no de Vercel, y es lo que impide
  subir vídeos grandes al chat. Fue de las primeras cosas que se pidieron y sigue sin resolverse
  por esto.

---

## 3. Preguntas sin contestar

1. **Las casillas de fase marcadas** del panel de clientes (unas 120): ¿son reales o eran pruebas?
   Si eran pruebas, se borran en un minuto y el panel arranca limpio.
2. **Una reunión programada** de prueba: ¿se borra?
3. **Tekstila** tiene 7 contraseñas en el Canva pero no existe como canal. ¿Se crea?
4. En el Drive hay dos carpetas, **LUBA COMPANY** y **LILAS MANAGMENT**, que no tienen canal.
   ¿Qué son?

---

## 4. Cosas a revisar

- **MIM'S**: en el Canva su Instagram es el mismo que el de Moss Matcha
  (`mossthematcharoom@gmail.com`). Parece copiado por error. Está anotado en su ficha de Claves.
- **Metricool de la agencia**: la contraseña acaba en guion (`21Days1234-`) y no queda claro si el
  guion es parte de ella. Si no entra, probar sin él.
- **18 clientes sin tablero de Pinterest**: en Slack solo aparecían cinco.
- **Contraseña de GitHub**: se le puso `Xpr2e-i4ZpKn`, la misma de los correos, el Drive y Slack, y
  esa está escrita en un Canva que circula. Quien tenga ese Canva puede tocar el código de la
  aplicación. Conviene cambiarla por una propia y activar la verificación en dos pasos.
- **Cuatro proyectos sobrantes en Vercel** (`bitacora-app`, `bitacora-web`, `bitacora-git`,
  `bitacora-21days`), de intentos de despliegue. El bueno es `bitacora`. Se pueden borrar.

---

## 5. Apagado a propósito

- **Transcribir audios.** Se quitó el botón: necesitaba una clave de OpenAI de pago. La función de
  borde `transcribir` y la tabla `transcripts` siguen instaladas. Para reactivarlo: devolver el
  bloque de transcripción a `Adjunto.tsx` y añadir `OPENAI_API_KEY` en Supabase → Edge Functions →
  Secrets. Las notas de voz y las velocidades funcionan sin nada de eso.

---

## 6. Datos que conviene tener a mano

- **La aplicación:** <https://bitacora-ashy.vercel.app> — ojo, `bitacora-21-days1.vercel.app` es un
  alias viejo que se quedó parado; no usarlo.
- **Rama de publicación:** `main`. Lo que llega ahí se publica solo.
- **Vercel:** equipo 21DAYS, proyecto `bitacora`, cuenta `hola21days@gmail.com` (entra por GitHub).
- **Entrar a la aplicación:** cada uno con su correo `@21daysagency.com`. Adri entra con `hola@`,
  no con `adri@`. Las contraseñas están en el canal **21DAYS → Claves**, y cada uno puede
  cambiarse la suya desde **Mi cuenta**, abajo a la izquierda.
