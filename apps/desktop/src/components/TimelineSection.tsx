import { useState } from "react";
import type { ApplicationEvent, ApplicationStatus } from "@applyradar/shared";
import { STATUS_LABELS } from "@applyradar/shared";
import { eventService } from "../services";

interface Props {
  events: ApplicationEvent[];
  currentStatus: string;
}

function getStatusLabel(s: string) {
  return STATUS_LABELS[s as ApplicationStatus] || s;
}

function getEventDotColor(event: ApplicationEvent) {
  if (event.event_type === "status_change") return "bg-blue-400";
  if (event.event_type === "login_expired") return "bg-amber-400";
  if (event.event_type === "check_failed") return "bg-red-400";
  if (event.event_type === "note_added" && !event.handled_at) return "bg-amber-400";
  return "bg-gray-300";
}

export default function TimelineSection({ events, currentStatus }: Props) {
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const handleResolve = async (eventId: string, action: "accepted" | "dismissed") => {
    setResolvingIds((prev) => new Set(prev).add(eventId));
    setError("");
    try {
      await eventService.resolveApplicationEvent(eventId, action);
      // The parent should refresh events
    } catch (e) {
      console.error("Failed to resolve event:", e);
      setError(`操作失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">状态时间线</h2>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">暂无事件记录</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {events.slice(0, 50).map((event) => {
            const isPending = event.event_type === "note_added" && Boolean(event.new_status) && !event.handled_at;
            const displayOldStatus = event.old_status || (isPending ? currentStatus : undefined);

            return (
              <div key={event.id} className="flex gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventDotColor(event)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-gray-800">{event.title}</div>
                    {isPending && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">待确认</span>
                    )}
                    {event.handled_action && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                        event.handled_action === "accepted" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {event.handled_action === "accepted" ? "已采用" : "已忽略"}
                      </span>
                    )}
                  </div>
                  {event.content && (
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{event.content}</p>
                  )}
                  {event.new_status && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {displayOldStatus && (
                        <>
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                            {getStatusLabel(displayOldStatus)}
                          </span>
                          <span className="text-xs text-gray-300">→</span>
                        </>
                      )}
                      <span className="text-xs px-1.5 py-0.5 bg-stone-50 text-stone-700 rounded">
                        {getStatusLabel(event.new_status)}
                      </span>
                    </div>
                  )}
                  {isPending && event.new_status && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-amber-700">采用后状态将更新为 {getStatusLabel(event.new_status)}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResolve(event.id, "accepted")}
                          disabled={resolvingIds.has(event.id)}
                          className="rounded bg-stone-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                        >
                          确认采用
                        </button>
                        <button
                          onClick={() => handleResolve(event.id, "dismissed")}
                          disabled={resolvingIds.has(event.id)}
                          className="rounded px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-300 mt-1">
                    {new Date(event.event_time).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
