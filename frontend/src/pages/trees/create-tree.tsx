import { ArrowLeft, Boxes, ListChecks, PanelsTopLeft } from 'lucide-react'
import { Link, useNavigate, useNavigationType } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'

export function CreateTreePage() {
  const { t } = useTranslation(), navigate = useNavigate(), navigationType = useNavigationType()
  const goBack = () => { if (navigationType === 'PUSH') navigate(-1); else navigate('/trees') }
  return <main className="mx-auto w-full max-w-5xl space-y-6">
    <Button type="button" variant="ghost" className="-ml-3" onClick={goBack}><ArrowLeft size={16} />{t('builder.createTreeChoice.back')}</Button>
    <PageHeader title={t('builder.createTreeChoice.title')} description={t('builder.createTreeChoice.description')} />
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex min-h-64 flex-col rounded-2xl border border-primary/35 bg-card p-6 shadow-soft">
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><PanelsTopLeft size={22} /></div>
        <h2 className="text-lg font-semibold">Visual Builder</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{t('builder.createTreeChoice.visualDescription')}</p>
        <Button asChild className="mt-5 w-full"><Link to="/trees/new/visual">{t('builder.createTreeChoice.openVisual')}</Link></Button>
      </section>
      <section className="flex min-h-64 flex-col rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent text-foreground"><ListChecks size={22} /></div>
        <h2 className="text-lg font-semibold">Guided Wizard</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{t('builder.createTreeChoice.wizardDescription')}</p>
        <Button asChild variant="outline" className="mt-5 w-full"><Link to="/trees/new/advanced">{t('builder.createTreeChoice.startWizard')}</Link></Button>
      </section>
    </div>
    <p className="text-center text-sm text-muted-foreground"><Boxes className="mr-1 inline size-4" />{t('builder.createTreeChoice.templatePrompt')} <Link className="font-medium text-primary hover:underline" to="/templates">{t('builder.createTreeChoice.browseTemplates')}</Link></p>
  </main>
}
