import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { LegalLinks, openLegalPage } from '@/components/LegalLinks';
import { legalUrls } from '@/config/legal';

describe('LegalLinks', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => openURL.mockRestore());

  it('shows privacy policy and imprint by default and opens the website', async () => {
    await render(<LegalLinks />);
    expect(screen.getByText('Datenschutz')).toBeOnTheScreen();
    expect(screen.getByText('Impressum')).toBeOnTheScreen();
    expect(screen.queryByText('Konto löschen')).toBeNull();

    await fireEvent.press(screen.getByRole('link', { name: 'Datenschutz (öffnet die Website)' }));
    expect(openURL).toHaveBeenCalledWith('https://reserver.gentlegroup.de/datenschutz.html');
    await fireEvent.press(screen.getByTestId('legal-imprint'));
    expect(openURL).toHaveBeenLastCalledWith('https://reserver.gentlegroup.de/impressum.html');
  });

  it('renders only the requested links', async () => {
    await render(<LegalLinks links={['support', 'deleteAccount']} />);
    expect(screen.queryByText('Datenschutz')).toBeNull();
    await fireEvent.press(screen.getByText('Konto löschen'));
    expect(openURL).toHaveBeenCalledWith(legalUrls.deleteAccount);
  });

  it('swallows errors when no browser can open the link', async () => {
    openURL.mockRejectedValueOnce(new Error('no handler'));
    await expect(openLegalPage('support')).resolves.toBeUndefined();
    expect(openURL).toHaveBeenCalledWith('https://reserver.gentlegroup.de/support.html');
  });
});
