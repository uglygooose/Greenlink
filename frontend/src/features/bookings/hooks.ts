import { useQuery } from "@tanstack/react-query";

import { fetchPlayerBookingReadModel } from "../../api/operations";
import type { PlayerBookingReadModelResponse } from "../../types/bookings";

export const bookingKeys = {
  playerReadModel: (clubId: string) => ["bookings", clubId, "player-read-model"] as const,
};

interface PlayerBookingReadModelQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

export function usePlayerBookingReadModelQuery({
  accessToken,
  selectedClubId,
}: PlayerBookingReadModelQueryOptions) {
  return useQuery<PlayerBookingReadModelResponse>({
    queryKey: bookingKeys.playerReadModel(selectedClubId ?? "none"),
    queryFn: () =>
      fetchPlayerBookingReadModel({}, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}
