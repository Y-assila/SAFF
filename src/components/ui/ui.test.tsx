import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Badge, Button, Dialog, EmptyState, ErrorState, Input, LoadingState } from '.'

describe('Button', () => {
  it('defaults to type="button" and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Input', () => {
  it('associates label, hint and error with the field', () => {
    render(<Input label="Phone" hint="Moroccan number" error="Invalid number" dir="ltr" />)
    const input = screen.getByLabelText('Phone')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('dir', 'ltr')
    expect(input).toHaveAccessibleDescription('Moroccan number Invalid number')
  })

  it('uses dir="auto" by default and is valid without an error', () => {
    render(<Input label="Name" />)
    const input = screen.getByLabelText('Name')
    expect(input).toHaveAttribute('dir', 'auto')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('Badge', () => {
  it('renders its text label', () => {
    render(<Badge tone="signal">Next in line</Badge>)
    expect(screen.getByText('Next in line')).toBeInTheDocument()
  })
})

describe('Dialog', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Dialog
          open={open}
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
          title="Confirm"
          description="Are you sure?"
        />
      </>
    )
  }

  it('opens, is labelled by its title, and closes from the close button', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAccessibleDescription('Are you sure?')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(dialog).not.toHaveAttribute('open')
  })
})

describe('state components', () => {
  it('LoadingState is a polite status with a localised label', () => {
    render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('EmptyState shows title and action', () => {
    render(<EmptyState title="No customers" action={<Button>Refresh</Button>} />)
    expect(screen.getByRole('heading', { name: 'No customers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('ErrorState is an alert and offers retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
