import type { Locale } from "@/i18n";

/**
 * Gerçek ekran görüntüleri hazır olana kadar kullanılan, kodla çizilmiş
 * arayüz temsilleri. Ekran görüntüsü PNG'lerini aldığınızda bu bileşeni
 * <Image /> ile değiştirmeniz yeterli.
 */

const L = {
  tr: {
    projects: "Aktif proje",
    deadline: "Yaklaşan teslim",
    budget: "Toplam bütçe",
    todo: "Yapılacak",
    doing: "Devam eden",
    done: "Tamamlandı",
    tasks: [
      ["Ana sayfa tasarımı", "Galata · bugün"],
      ["Teklif revizyonu", "Aydın Yapı · 18:00"],
      ["Saha fotoğrafları", "Kartal · yarın"],
      ["Sözleşme taslağı", "Hukuk · 14 Ağu"],
      ["Fatura yükleme", "Muhasebe · gecikmiş"],
      ["Ekip toplantısı notu", "Yönetim · dün"],
    ],
    income: "Gelir",
    expense: "Gider",
    net: "Net",
    pending: "Bekleyen tahsilat",
    progress: "Bütçe kullanımı",
    chatUser: "Galata işini bitirdim",
    chatLio: "✅ Görev tamamlandı. Proje ilerlemesi %71 oldu. Sıradaki iş: teklif revizyonu (18:00).",
  },
  en: {
    projects: "Active projects",
    deadline: "Upcoming deadlines",
    budget: "Total budget",
    todo: "To do",
    doing: "In progress",
    done: "Done",
    tasks: [
      ["Homepage design", "Galata · today"],
      ["Proposal revision", "Aydın · 18:00"],
      ["Site photos", "Kartal · tomorrow"],
      ["Contract draft", "Legal · Aug 14"],
      ["Upload invoices", "Finance · overdue"],
      ["Meeting notes", "Management · yesterday"],
    ],
    income: "Income",
    expense: "Expenses",
    net: "Net",
    pending: "Outstanding",
    progress: "Budget used",
    chatUser: "Finished the Galata job",
    chatLio: "✅ Task completed. Project progress is now 71%. Next up: proposal revision (18:00).",
  },
};

export default function MockScreen({ kind, locale }: { kind: string; locale: Locale }) {
  const t = L[locale === "en" ? "en" : "tr"];

  if (kind === "dashboard") {
    return (
      <div className="mock">
        <div className="mock-side">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="mock-main">
          <div className="mock-row">
            <div className="mock-stat">
              <span>{t.projects}</span>
              <b>7</b>
            </div>
            <div className="mock-stat">
              <span>{t.deadline}</span>
              <b>3</b>
            </div>
            <div className="mock-stat">
              <span>{t.budget}</span>
              <b>₺1,24M</b>
            </div>
          </div>
          <div className="mock-row">
            {[0, 1, 2].map((i) => (
              <div className="mock-stat" key={i}>
                <span>{t.tasks[i][1]}</span>
                <b style={{ fontSize: "0.82rem" }}>{t.tasks[i][0]}</b>
                <div className="mock-bar" style={{ marginTop: 8 }}>
                  <span style={{ width: `${[62, 38, 84][i]}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mock-row">
            {[3, 4, 5].map((i) => (
              <div className="mock-stat" key={i}>
                <span>{t.tasks[i][1]}</span>
                <b style={{ fontSize: "0.82rem" }}>{t.tasks[i][0]}</b>
                <div className="mock-bar" style={{ marginTop: 8 }}>
                  <span style={{ width: `${[24, 91, 55][i - 3]}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "kanban") {
    return (
      <div className="mock">
        <div className="mock-side">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="mock-main">
          <div className="mock-kanban">
            <div className="mock-col">
              <b>{t.todo}</b>
              {[2, 3].map((i) => (
                <div className="mock-task" key={i}>
                  {t.tasks[i][0]}
                  <em>{t.tasks[i][1]}</em>
                </div>
              ))}
            </div>
            <div className="mock-col">
              <b>{t.doing}</b>
              {[0, 1, 4].map((i) => (
                <div className="mock-task" key={i}>
                  {t.tasks[i][0]}
                  <em>{t.tasks[i][1]}</em>
                </div>
              ))}
            </div>
            <div className="mock-col">
              <b>{t.done}</b>
              {[5].map((i) => (
                <div className="mock-task" key={i}>
                  {t.tasks[i][0]}
                  <em>{t.tasks[i][1]}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "finance") {
    return (
      <div className="mock">
        <div className="mock-side">
          <i />
          <i />
          <i />
        </div>
        <div className="mock-main">
          <div className="mock-row">
            <div className="mock-stat">
              <span>{t.income}</span>
              <b>₺148.500</b>
            </div>
            <div className="mock-stat">
              <span>{t.expense}</span>
              <b>₺37.200</b>
            </div>
            <div className="mock-stat">
              <span>{t.net}</span>
              <b style={{ color: "var(--ok)" }}>₺111.300</b>
            </div>
          </div>
          <div className="mock-stat">
            <span>{t.progress} · Galata</span>
            <div className="mock-bar" style={{ marginTop: 10 }}>
              <span style={{ width: "68%" }} />
            </div>
          </div>
          <div className="mock-stat">
            <span>{t.progress} · Aydın</span>
            <div className="mock-bar" style={{ marginTop: 10 }}>
              <span style={{ width: "42%" }} />
            </div>
          </div>
          <div className="mock-stat">
            <span>{t.pending}</span>
            <b style={{ color: "var(--warn)" }}>₺62.000</b>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#f4f1ec",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 300,
        backgroundImage: "radial-gradient(rgba(62,72,88,.05) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="bubble bubble-user" style={{ animation: "none" }}>
        {t.chatUser}
      </div>
      <div className="bubble bubble-lio" style={{ animation: "none" }}>
        {t.chatLio}
      </div>
    </div>
  );
}
