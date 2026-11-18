import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Disc3, Home } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-8 bg-gradient-surface border-audio-control text-center space-y-4">
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-primary/15">
          <Disc3 className="w-8 h-8 text-primary" />
        </div>

        <p className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">404</p>

        <h1 className="text-xl font-semibold text-foreground">This track does not exist</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-foreground">{location.pathname}</span> is not a page in
          this studio.
        </p>

        <Button asChild className="bg-gradient-primary hover:shadow-glow">
          <Link to="/">
            <Home className="w-4 h-4 mr-2" />
            Back to the player
          </Link>
        </Button>
      </Card>
    </div>
  );
};

export default NotFound;
