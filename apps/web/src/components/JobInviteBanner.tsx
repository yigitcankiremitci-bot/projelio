import { useEffect, useState } from "react";
import type { JobMember } from "@projelio/shared";
import { colors } from "../theme/colors";
import { fetchPendingJobInvites, onJobInvitesChanged, respondToJobInvite } from "../lib/jobInvites";

/**
 * İş detay sayfasının üstünde beliren davet şeridi.
 *
 * Bildirimden gelen kullanıcı işi görüp karar verebilsin diye: kabul edene
 * kadar iş onun anasayfasında görünmez, projelerine ve dosyalarına erişemez.
 * Bekleyen daveti yoksa hiçbir şey render etmez.
 */
export default function JobInviteBanner({ jobId }: { jobId: string }) {
  const c = colors.light;
  const [invite, setInvite] = useState<JobMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<"approved" | "rejected" | null>(null);

  const load = () => {
    fetchPendingJobInvites().then((invites) => setInvite(invites.find((i) => i.jobId === jobId) ?? null));
  };

  useEffect(load, [jobId]);
  // Aynı davet bildirim çanından da yanıtlanabilir; şerit kendini toplasın.
  useEffect(() => onJobInvitesChanged(load), [jobId]);

  const respond = async (approve: boolean) => {
    if (!invite || busy) return;
    setBusy(true);
    try {
      await respondToJobInvite(invite.id, approve);
      setAnswer(approve ? "approved" : "rejected");
      setInvite(null);
    } catch {
      setBusy(false);
    }
  };

  if (answer) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          border: `1px solid ${c.border}`,
          background: c.surface,
          fontSize: 15,
          color: c.textSecondary,
          marginBottom: 14,
        }}
      >
        {answer === "approved"
          ? "Daveti kabul ettin — bu iş artık anasayfandaki “Katıldıklarım” listesinde."
          : "Daveti reddettin. İş sahibi bilgilendirildi."}
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${c.accent}`,
        background: `${c.accent}14`,
        marginBottom: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary }}>Bu işe davet edildin</div>
        <div style={{ fontSize: 15, color: c.textSecondary }}>
          {invite.invitedByName ?? "Bir kullanıcı"} seni bu işin ekibine ekledi
          {invite.title ? ` (${invite.title})` : ""}. Kabul edene kadar iş anasayfanda görünmez.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => respond(false)}
          disabled={busy}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textSecondary,
            fontSize: 15,
          }}
        >
          Reddet
        </button>
        <button
          onClick={() => respond(true)}
          disabled={busy}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Kabul et
        </button>
      </div>
    </div>
  );
}
