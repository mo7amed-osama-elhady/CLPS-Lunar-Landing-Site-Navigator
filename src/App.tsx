/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageProvider } from './context/LanguageContext.tsx';
import { MissionProvider, useMission } from './context/MissionContext.tsx';
import { Layout } from './components/Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ExploreSitesPage } from './pages/ExploreSitesPage.tsx';

function PageRouter() {
  const { page } = useMission();

  if (page === 'explore') return <ExploreSitesPage />;
  return <HomePage />;
}

export default function App() {
  return (
    <LanguageProvider>
      <MissionProvider>
        <Layout>
          <PageRouter />
        </Layout>
      </MissionProvider>
    </LanguageProvider>
  );
}
