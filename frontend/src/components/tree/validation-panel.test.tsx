import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import i18n from '@/i18n'
import { ValidationPanel } from './validation-panel'

afterEach(async () => { await i18n.changeLanguage('en') })

it('describes successful validation without claiming Tree readiness in either language', async () => {
 await i18n.changeLanguage('en')
 render(<ValidationPanel validation={{ valid: true, errors: [], validated_at: '' }} />)
 expect(screen.getByText('Configuration valid')).toBeVisible()
 expect(screen.queryByText('Ready for use')).toBeNull()
 await act(async () => { await i18n.changeLanguage('th') })
 expect(screen.getByText('การตั้งค่าผ่านการตรวจสอบ')).toBeVisible()
})
