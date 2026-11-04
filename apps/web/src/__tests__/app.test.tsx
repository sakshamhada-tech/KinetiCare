import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../App';

describe('App', () => {
  it('renders the app shell without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(container.querySelector('.app')).not.toBeNull();
  });
});
