import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuestionForm, { formFromQuestion, type FormState } from '@/components/QuestionForm';
import { ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { getQuestion } from '@/lib/api';
import { toAppError } from '@/lib/errors';

export default function QuestionEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [initial, setInitial] = useState<FormState | null | undefined>(id ? undefined : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getQuestion(id).then((q) => setInitial(formFromQuestion(q))).catch((e) => setError(toAppError(e).message));
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={id ? 'تعديل السؤال' : 'سؤال جديد'} subtitle="يُحفظ السؤال في بنكك الدائم ويمكن استخدامه في حصص متعددة" />
      {error ? <ErrorBox error={error} /> : initial === undefined ? <Spinner /> : (
        <QuestionForm key={id ?? 'new'} initial={initial ?? undefined} onSaved={() => nav('/t/bank')} onCancel={() => nav(-1)} />
      )}
    </div>
  );
}
