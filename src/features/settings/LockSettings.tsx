import { useState } from 'react'
import { hashPin, newSalt, type LockConfig } from '../lock/lockApi'
import { useLock } from '../lock/LockContext'
import { PinPad } from '../lock/PinPad'
import { SelectRow, SettingsSection, ToggleRow } from './SettingRows'

const AFTER = [1, 5, 15, 30, 60].map((n) => ({ value: n, label: n === 60 ? '1 hour' : `${n} minute${n === 1 ? '' : 's'}` }))

interface Props {
  /** Persists the lock config (injectable for tests). */
  save: (config: LockConfig) => Promise<void> | void
}

type Step = { kind: 'idle' } | { kind: 'enter' } | { kind: 'confirm'; first: string }

export function LockSettings({ save }: Props) {
  const { config, lockNow, markUnlocked } = useLock()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [message, setMessage] = useState<string | null>(null)

  async function setPin(pin: string) {
    markUnlocked()
    const salt = newSalt()
    await save({ ...config, enabled: true, salt, pinHash: await hashPin(pin, salt) })
  }

  return (
    <SettingsSection title="Parental lock" id="lock">
      {step.kind === 'enter' && (
        <PinPad
          title="Choose a 4-digit PIN"
          onCancel={() => setStep({ kind: 'idle' })}
          onSubmit={(pin) => {
            setStep({ kind: 'confirm', first: pin })
            return true
          }}
        />
      )}
      {step.kind === 'confirm' && (
        <PinPad
          title="Enter it again"
          onCancel={() => setStep({ kind: 'idle' })}
          onSubmit={async (pin) => {
            if (pin !== step.first) {
              setMessage("PINs didn't match. Start over.")
              setStep({ kind: 'idle' })
              return true
            }
            await setPin(pin)
            setMessage('PIN saved. Settings will lock after inactivity.')
            setStep({ kind: 'idle' })
            return true
          }}
        />
      )}
      {step.kind === 'idle' && (
        <>
          <ToggleRow
            label="Turn parental lock on after inactivity"
            hint="Settings need a PIN after the device sits idle. A simple kid lock, not strong security."
            checked={config.enabled && !!config.pinHash}
            onChange={(on) => {
              setMessage(null)
              if (on) setStep({ kind: 'enter' })
              else void save({ enabled: false, lockAfterMinutes: config.lockAfterMinutes })
            }}
          />
          {config.enabled && config.pinHash && (
            <>
              <SelectRow label="Lock after" value={config.lockAfterMinutes} options={AFTER} onChange={(v) => void save({ ...config, lockAfterMinutes: v })} />
              <div className="setting-row">
                <span className="setting-row__label">PIN</span>
                <div className="row">
                  <button type="button" className="button" onClick={() => setStep({ kind: 'enter' })}>
                    Change PIN
                  </button>
                  <button type="button" className="button" onClick={lockNow}>
                    Lock now
                  </button>
                </div>
              </div>
            </>
          )}
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </SettingsSection>
  )
}
