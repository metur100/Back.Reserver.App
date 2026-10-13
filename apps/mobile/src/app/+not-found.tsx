import { router, Stack } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components/ui';
import { de } from '@/i18n/de';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: de.notFound.title }} />
      <EmptyState
        icon="link"
        title={de.notFound.title}
        text={de.notFound.text}
        action={<Button label={de.order.backHome} icon="home" onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
