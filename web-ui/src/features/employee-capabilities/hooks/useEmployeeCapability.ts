import { useCallback, useEffect, useRef, useState } from "react";
import { hasAccessToken, withAccessToken } from "../../../shared/api/http";
import { employeeCapabilityApi } from "../data/employeeCapabilityApi";
import type { EmployeeCapabilityResponse } from "../model/types";

type EmployeeEvent = EmployeeCapabilityResponse & {
  type?: string;
  employeeId?: string;
};

const sameSnapshot = (left: EmployeeCapabilityResponse | null, right: EmployeeCapabilityResponse) => (
  JSON.stringify(left) === JSON.stringify(right)
);

const normalize = (value: EmployeeCapabilityResponse): EmployeeCapabilityResponse => {
  const confirmed = value.modificationConfirmed ?? value.employee?.modificationConfirmed ?? false;
  return {
    ...value,
    modificationConfirmed: confirmed,
    employee: value.employee ? { ...value.employee, modificationConfirmed: confirmed } : value.employee,
  };
};

export function useEmployeeCapability(employeeId: string) {
  const [snapshot, setSnapshot] = useState<EmployeeCapabilityResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(employeeId));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const applySnapshot = useCallback((next: EmployeeCapabilityResponse) => {
    const normalized = normalize(next);
    setSnapshot((current) => sameSnapshot(current, normalized) ? current : normalized);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++requestVersionRef.current;
    if (!employeeId) {
      setSnapshot(null);
      setLoading(false);
      setError("");
      return;
    }
    try {
      const result = await employeeCapabilityApi.status(employeeId, signal);
      if (signal?.aborted || requestVersion !== requestVersionRef.current) return;
      applySnapshot(result);
      setError("");
    } catch (reason) {
      if (!signal?.aborted && requestVersion === requestVersionRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (!signal?.aborted && requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [applySnapshot, employeeId]);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setLoading(Boolean(employeeId));
    setError("");
    void refresh(controller.signal);
    if (!employeeId || !hasAccessToken || typeof EventSource === "undefined") {
      return () => controller.abort();
    }

    const source = new EventSource(withAccessToken("/events"));
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as EmployeeEvent;
        if (payload.employeeId !== employeeId) return;
        if (payload.type === "employee_status") {
          setSnapshot((current) => {
            const next = normalize({
              ...(current || {}),
              status: payload.status || current?.status,
              modificationConfirmed: payload.modificationConfirmed ?? current?.modificationConfirmed,
            });
            return sameSnapshot(current, next) ? current : next;
          });
        }
        if (payload.type === "employee_confirmation_changed") {
          setSnapshot((current) => {
            const next = normalize({
              ...(current || {}),
              modificationConfirmed: payload.modificationConfirmed === true,
            });
            return sameSnapshot(current, next) ? current : next;
          });
        }
      } catch { /* Initial GET remains authoritative if an event is malformed. */ }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      controller.abort();
      source.close();
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [employeeId, refresh]);

  const confirmModification = useCallback(async () => {
    if (!employeeId || confirming || snapshot?.modificationConfirmed || snapshot?.status?.active) return false;
    setConfirming(true);
    setError("");
    try {
      const result = await employeeCapabilityApi.confirm(employeeId);
      applySnapshot({ ...snapshot, ...result, modificationConfirmed: true });
      window.dispatchEvent(new CustomEvent("negus:project-status-changed"));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setConfirming(false);
    }
  }, [applySnapshot, confirming, employeeId, snapshot]);

  return { snapshot, loading, confirming, error, confirmModification, refresh };
}
