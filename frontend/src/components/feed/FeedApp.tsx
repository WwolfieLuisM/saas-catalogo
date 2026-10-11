'use client';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Hero } from './Hero';
import { Catalog } from './Catalog';
import { ContactSection, Footer } from './Chrome';
import { DetailModal } from './DetailModal';
import { CartDrawer, FavoritesDrawer, CollectionDrawer } from './Drawers';
import { ListFab } from './ListFab';
import { WelcomeDialog } from './WelcomeDialog';
import { Toast } from './Chrome';

export function FeedApp() {
  return (
    <>
      <Header />
      <Sidebar />
      <main>
        <Hero />
        <Catalog />
        <ContactSection />
      </main>
      <Footer />
      <DetailModal />
      <CartDrawer />
      <FavoritesDrawer />
      <CollectionDrawer />
      <ListFab />
      <WelcomeDialog />
      <Toast />
    </>
  );
}
