import { BRAND } from "@/lib/brand";
import LoginForm from "@/components/LoginForm";
import Logo from "@/components/Logo";

export const metadata = { title: `Entrar · ${BRAND.product}` };

export default function EntrarPage() {
  return (
    <main className="gate">
      <aside className="gate__aside">
        <div>
          <Logo />
          <div className="gate__mark" style={{ marginTop: "1.1rem" }}>
            Bit<span>á</span>cora
          </div>
          <div className="gate__brandline" style={{ marginTop: "0.4rem" }}>
            {BRAND.company} · {BRAND.tagline}
          </div>
        </div>
        <p className="gate__lede">
          Un sitio único donde el equipo ve, cliente a cliente, qué hay pendiente, quién lo lleva
          y qué se ha hablado. Sin hilos de correo perdidos.
        </p>
        <ul className="gate__list">
          <li>
            <span className="gate__bullet" />
            <span>
              <b>Tablero por cliente</b> — arrastra los encargos entre Idear, Grabar, Editar,
              Programar y Report.
            </span>
          </li>
          <li>
            <span className="gate__bullet" />
            <span>
              <b>Chat interno</b> — conversación del equipo sobre cada cliente, que el cliente no ve.
            </span>
          </li>
          <li>
            <span className="gate__bullet" />
            <span>
              <b>Fichaje</b> — entrada, pausa, regreso y salida, con las horas del día a la vista.
            </span>
          </li>
          <li>
            <span className="gate__bullet" />
            <span>
              <b>En vivo</b> — lo que cambia un compañero aparece al momento en tu pantalla.
            </span>
          </li>
        </ul>
      </aside>

      <div className="gate__form-wrap">
        <LoginForm />
      </div>
    </main>
  );
}
