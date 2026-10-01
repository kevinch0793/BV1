import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveClient, rejectClient, setProfilePlan, setClientDefaultPlan } from "@/app/actions/admin";
import { PlanSelect } from "@/components/admin/PlanSelect";
import { ProfileEnableToggle } from "@/components/admin/ProfileEnableToggle";
import { setProfilePaused } from "@/app/actions/pipeline";
import { planOf } from "@/lib/plan";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default async function AdminClientsPage() {
  await requireAdmin();
  const clients = await prisma.client.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      defaultPlan: true,
      profiles: { select: { id: true, label: true, fullName: true, plan: true, paused: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { profiles: true } },
    },
  });
  const pendingCount = clients.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Clients</h1>
        <p className="text-sm text-neutral-500">
          Approve or decline registration requests. {pendingCount} pending.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Profiles &amp; plans</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {clients.map((c) => (
              <tr key={c.id} className="align-middle">
                <td className="px-4 py-3 font-medium text-neutral-900">{c.email}</td>
                <td className="px-4 py-3 text-neutral-600">{c.role}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge[c.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {c.profiles.length === 0 ? (
                    <span className="text-xs text-neutral-400">
                      none yet — new ones start on{" "}
                      <span className="font-medium text-neutral-600">{planOf(c.defaultPlan)}</span>
                    </span>
                  ) : (
                    <div className="space-y-1">
                      {c.profiles.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="min-w-[10rem] truncate text-xs text-neutral-700" title={`${p.fullName} — ${p.label}`}>
                            {p.fullName}
                          </span>
                          <ProfileEnableToggle enabled={!p.paused} onChange={setProfilePaused.bind(null, p.id)} />
                          <PlanSelect
                            value={planOf(p.plan)}
                            title={`Plan for ${p.fullName}`}
                            onChange={setProfilePlan.bind(null, p.id)}
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-neutral-400">
                        <span className="min-w-[10rem]">new profiles start on</span>
                        <PlanSelect
                          value={planOf(c.defaultPlan)}
                          title="Plan that NEW profiles of this client inherit — existing ones are unchanged"
                          onChange={setClientDefaultPlan.bind(null, c.id)}
                        />
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {c.role !== "admin" && c.status !== "approved" && (
                      <>
                        <form action={approveClient.bind(null, c.id, "normal")}>
                          <button
                            title="Approve — jobs are fetched and tracked, applications use one fixed resume"
                            className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Approve · Normal
                          </button>
                        </form>
                        <form action={approveClient.bind(null, c.id, "tailor")}>
                          <button
                            title="Approve — every job gets a resume tailored to it"
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            Approve · Tailor
                          </button>
                        </form>
                      </>
                    )}
                    {c.role !== "admin" && c.status !== "rejected" && (
                      <form action={rejectClient.bind(null, c.id)}>
                        <button className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                          {c.status === "approved" ? "Revoke" : "Decline"}
                        </button>
                      </form>
                    )}
                    {c.role === "admin" && <span className="text-xs text-neutral-400">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
