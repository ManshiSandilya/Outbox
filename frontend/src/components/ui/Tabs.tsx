type Tab<T extends string> = { id: T; label: string };
type TabsProps<T extends string> = { tabs: readonly Tab<T>[]; activeTab: T; onChange: (tab: T) => void };

export function Tabs<T extends string>({ tabs, activeTab, onChange }: TabsProps<T>) {
  return <div className="border-b border-slate-200" role="tablist">
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onChange(tab.id)} className={`mr-6 border-b-2 px-1 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{tab.label}</button>)}
  </div>;
}
