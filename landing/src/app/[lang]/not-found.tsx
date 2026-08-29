import Link from "next/link";
import { tr } from "@/i18n/tr";

export default function NotFound() {
  return (
    <section className="section">
      <div className="wrap-narrow center">
        <span className="eyebrow" style={{ justifyContent: "center" }}>
          404
        </span>
        <h1 className="h2">{tr.notFound.title}</h1>
        <p className="lede" style={{ margin: "16px auto 28px" }}>
          {tr.notFound.lede}
        </p>
        <Link className="btn btn-primary" href="/tr">
          {tr.common.backHome}
        </Link>
      </div>
    </section>
  );
}
