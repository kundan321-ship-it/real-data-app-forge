import { queryOptions } from "@tanstack/react-query";
import { getMeasurements } from "./wifi.functions";

export const MEASUREMENTS_QUERY_KEY = ["wifi-measurements"] as const;

export const measurementsQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: [...MEASUREMENTS_QUERY_KEY, userId],
    queryFn: () => getMeasurements(),
    staleTime: 15_000,
  });
