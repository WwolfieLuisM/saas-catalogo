'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type TopbarTitleSetter = (path: string, title: string) => void;

export const TopbarTitleContext = createContext<TopbarTitleSetter | null>(null);

export function useTopbarTitle(): TopbarTitleSetter {
  return useContext(TopbarTitleContext) ?? (() => undefined);
}

export function TopbarTitleProvider({
  value,
  children,
}: {
  value: TopbarTitleSetter;
  children: ReactNode;
}) {
  return <TopbarTitleContext.Provider value={value}>{children}</TopbarTitleContext.Provider>;
}
