'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function EmptyCompany() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Nenhuma empresa selecionada</CardTitle>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/app/empresas">Ir para Minhas Empresas</a>
        </Button>
      </CardContent>
    </Card>
  );
}
