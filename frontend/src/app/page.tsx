'use client';

import { FeedProvider } from '@/hooks/useFeed';
import { FeedApp } from '@/components/feed/FeedApp';

export default function Page() {
  return (
    <FeedProvider>
      <FeedApp />
    </FeedProvider>
  );
}
