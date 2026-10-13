import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthContext';
import { AppText, Button, Card, Icon, Notice, Screen, TextField } from '@/components/ui';
import { de } from '@/i18n/de';
import { colors, spacing } from '@/theme';

const loginSchema = z.object({
  email: z.string().trim().min(1, de.validation.emailLoginRequired).regex(/^[^\s@]+@[^\s@]+$/, de.validation.emailInvalid),
  password: z.string().min(1, de.validation.passwordRequired),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const { status, login, sessionExpired } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  if (status === 'signedIn') return <Redirect href="/team" />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      router.replace('/team');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name="business" size={30} color={colors.accentText} />
        </View>
        <AppText variant="title" accessibilityRole="header">
          {de.auth.title}
        </AppText>
        <AppText color={colors.textMuted}>{de.auth.subtitle}</AppText>
      </View>
      {sessionExpired ? <Notice tone="warning">{de.errors.sessionExpired}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card style={styles.form}>
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label={de.auth.email}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              testID="login-email"
            />
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label={de.auth.password}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              testID="login-password"
              right={
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? de.auth.hidePassword : de.auth.showPassword}
                  style={styles.eye}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={22} color={colors.textMuted} />
                </Pressable>
              }
            />
          )}
        />
        <Button
          label={form.formState.isSubmitting ? de.auth.submitting : de.auth.submit}
          icon="log-in"
          size="lg"
          loading={form.formState.isSubmitting}
          onPress={() => void onSubmit()}
          testID="login-submit"
        />
      </Card>
      <View style={styles.customer}>
        <AppText variant="caption" center>
          {de.auth.customerHint}
        </AppText>
        <Button label={de.auth.toCustomer} variant="ghost" icon="storefront" onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, alignItems: 'flex-start' },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.lg },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  customer: { alignItems: 'center', gap: spacing.xs },
});
