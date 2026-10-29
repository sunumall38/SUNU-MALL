import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import type { Paginated } from "@/types";

/**
 * Liste paginée de l'API (défilement infini) : recharge quand `key` change
 * (nouvelle recherche, autre onglet) en ignorant les réponses périmées.
 */
export function usePaginated<T>(key: string, fetchPage: (page: number) => Promise<Paginated<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const requestId = useRef(0);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    const id = ++requestId.current;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchRef.current(1);
      if (id !== requestId.current) return;
      setItems(data.results);
      setCount(data.count);
      setPage(1);
      setHasMore(Boolean(data.next));
    } catch (err) {
      if (id === requestId.current) setError(apiErrorMessage(err, "Impossible de charger la liste."));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    setItems([]);
    setCount(null);
    void load("initial");
  }, [key, load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchRef.current(page + 1);
      if (id !== requestId.current) return;
      setItems((previous) => [...previous, ...data.results]);
      setPage(page + 1);
      setHasMore(Boolean(data.next));
    } catch (err) {
      if (id === requestId.current) setError(apiErrorMessage(err, "Impossible de charger la suite."));
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, page]);

  const refresh = useCallback(() => load("refresh"), [load]);
  const retry = useCallback(() => (items.length > 0 ? loadMore() : load("initial")), [items.length, load, loadMore]);

  return { items, count, loading, loadingMore, refreshing, error, refresh, loadMore, retry };
}
