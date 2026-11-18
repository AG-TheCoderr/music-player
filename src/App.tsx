import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Index from './pages/Index';
import NotFound from './pages/NotFound';

// On GitHub Pages the app lives under /<repo>/, so the router must strip that prefix.
// BASE_URL is '/' locally and '/music-player/' for the Pages build.
const routerBasename = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

const App = () => (
  <TooltipProvider>
    <ErrorBoundary>
      <Toaster />
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </TooltipProvider>
);

export default App;
