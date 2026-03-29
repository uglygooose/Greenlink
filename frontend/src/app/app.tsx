import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppRouter } from "../routes/router";
import { SessionProvider } from "../session/session-provider";

const queryClient = new QueryClient();

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </QueryClientProvider>
  );
}
