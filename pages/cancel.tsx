// pages/cancel.tsx
import Link from 'next/link';

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-12 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-xl w-full text-center shadow-xl">
        <h1 className="text-3xl font-bold text-red-400 mb-4">❌ Paiement annulé</h1>
        <p className="text-lg mb-6">Pas d&rsquo;inquiétude, rien n&rsquo;a été débité.</p>

        <div className="bg-gray-800 rounded-lg p-4 text-left text-sm text-gray-300 mb-6">
          <p className="mb-2">Ton panier est toujours actif. Tu peux finaliser ton paiement à tout moment.</p>
          <p className="mb-2">
            En cas de problème, tu peux nous contacter sur{' '}
            <a
              href="https://instagram.com/tixario"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline"
            >
              Instagram
            </a>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <Link
            href="/panier"
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-6 py-2 rounded"
          >
            🔁 Revenir au panier
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white underline"
          >
            ⬅️ Retour à l&rsquo;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
