import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'one'
import { Platform } from 'react-native'

const queryClient = new QueryClient()

export default function Layout() {
  if (Platform.OS === 'web') {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#0b0f0c" />
          <link rel="icon" href="/favicon.svg" />
        </head>
        <QueryClientProvider client={queryClient}>
          <Slot />
        </QueryClientProvider>
      </html>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  )
}
