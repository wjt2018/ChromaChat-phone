import { Route, Routes } from 'react-router-dom';

import AppShell from './app/AppShell';
import DesktopView from './features/desktop/DesktopView';
import ChatApp from './features/chat/ChatApp';
import SettingsApp from './features/settings/SettingsApp';

const App = () => {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DesktopView />} />
        <Route path="/apps/chat/:contactId?" element={<ChatApp />} />
        <Route path="/apps/settings" element={<SettingsApp />} />
      </Routes>
    </AppShell>
  );
};

export default App;
