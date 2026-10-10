/* UR-53 stage 2: band math (S12) in English, demo mode. Korean stays in FusionPage.test. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: jest.requireActual('../../api/viewerAdapter').viewerAdapter, useMockApi: true }));

const FusionPage = require('./FusionPage').default;

function renderPage() {
  return render(
    <LanguageProvider initial="en">
      <MemoryRouter initialEntries={['/app/analysis/fusion']}>
        <Routes>
          <Route path="/app/analysis/fusion" element={<FusionPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const longWait = { timeout: 4000 };
jest.setTimeout(20000);

describe('Band math in English', () => {
  test('step labels, validation errors, the formula error by code, rules and the pre-run check', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Band math' })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Steps' });
    // Each step reads number + label.
    expect(within(steps).getAllByRole('listitem').map((node) => node.textContent)).toEqual(['1Inputs', '2Formula', '3Rules', '4Preview & run']);
    expect(screen.getByRole('heading', { level: 2, name: 'Inputs' })).toBeInTheDocument();

    // Validation: nothing chosen yet.
    await waitFor(() => expect(screen.getByLabelText('A data')).not.toBeDisabled(), longWait);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose data and a variable for every letter.');
    expect(screen.getByLabelText('A normalization')).toHaveDisplayValue('Auto (per-satellite coefficients)');

    pick('A data', 'sentinel'); pick('A variable', 'NDWI');
    pick('B data', 'landsat'); pick('B variable', 'NDWI');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Formula' })).toBeInTheDocument();
    expect(screen.getByText('Available variables: A, B')).toBeInTheDocument();

    // The demo validator answers in Korean, with a code: English words it from the code.
    fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), { target: { value: 'A + C' } });
    expect(await screen.findByText('Character 5: “C” isn’t an input variable.', {}, longWait)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getAllByRole('alert').some((node) => node.textContent === 'Fix the error in the formula.')).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), { target: { value: 'A - B' } });
    expect(await screen.findByText('The formula is valid.', {}, longWait)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByLabelText('Grid reference')).toHaveDisplayValue('Coarsest (default)');
    expect(screen.getByRole('button', { name: 'Intersection (default)' })).toHaveAttribute('aria-pressed', 'true');
    pick('Time matching', 'nearest');
    fireEvent.change(screen.getByLabelText('Tolerance (days)'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the tolerance as a whole number of days (0 or more).');
    fireEvent.change(screen.getByLabelText('Tolerance (days)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(await screen.findByText('Ready to run.', {}, longWait)).toBeInTheDocument();
    expect((screen.getByLabelText('Result name') as HTMLInputElement).value).toMatch(/^Sentinel-2 · 2025_bandmath_\d{8}$/);
    expect(screen.getByRole('columnheader', { name: 'Expression' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Output variable name'), { target: { value: '1bad' } });
    expect(screen.getByText('The output variable name can use only letters, digits and underscores.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run band math' })).toBeDisabled();
  });
});
