import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url === '/classes') {
      return Promise.resolve({
        json: () => Promise.resolve([]),
      });
    }
    if (url === '/registrations') {
      return Promise.resolve({
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({ success: true }),
    });
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

test('renders the signup form', async () => {
  render(<App />);
  expect(await screen.findByText(/new signup/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
});
