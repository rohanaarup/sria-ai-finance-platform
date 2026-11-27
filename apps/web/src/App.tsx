import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { SystemSettingsDialog } from './components/layout/SystemSettingsDialog';
import { CommandPalette } from './components/ui/CommandPalette';
import { MetricCatalog } from './components/semantic/MetricCatalog';
import { WorkspacePage } from './pages/WorkspacePage';
import { MyDashboardsPage } from './pages/MyDashboardsPage';
import { useFinanceWorkspace } from './hooks/useFinanceWorkspace';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const ws = useFinanceWorkspace();
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <AppShell
      currentView={ws.currentView}
      onNavigate={ws.setCurrentView}
      activeTitle={ws.currentSpec.title}
      savedDashboards={ws.savedDashboards}
      recentDashboards={ws.recentDashboards}
      activeDashboardId={ws.activeDashboardDbId || ws.currentSpec.dashboardId}
      onOpenSavedDashboard={ws.handleOpenSaved}
      onSelectRecentDashboard={ws.handleOpenRecent}
      onOpenSystemSettings={() => setSettingsOpen(true)}
      onOpenCommandPalette={() => setCommandOpen(true)}
      onOpenMetricCatalog={() => setCatalogOpen(true)}
      theme={theme}
      onToggleTheme={toggleTheme}
      systemStatus={ws.systemStatus}
      dataSourceSummary={{
        sourceType: ws.currentSpec.dataProvenance.sourceType,
        sourceSystem: ws.currentSpec.dataProvenance.sourceSystem,
        isSynthetic: ws.currentSpec.dataProvenance.isSynthetic,
      }}
    >
      {ws.currentView === 'dashboards' ? (
        <MyDashboardsPage
          dashboards={ws.savedDashboards}
          recentDashboards={ws.recentDashboards}
          onOpenSaved={ws.handleOpenSaved}
          onOpenRecent={ws.handleOpenRecent}
          onRename={ws.handleRenameDashboard}
          onDuplicate={ws.handleDuplicateSaved}
          onShare={ws.handleShareDashboard}
          onDelete={ws.handleDeleteDashboard}
          onCreateNew={() => ws.setCurrentView('studio')}
        />
      ) : (
        <WorkspacePage
          mode={ws.currentView === 'canvas' ? 'canvas' : 'studio'}
          onSwitchMode={(m) => ws.setCurrentView(m)}
          currentSpec={ws.currentSpec}
          periodSeries={ws.periodSeries}
          buSlices={ws.buSlices}
          comparisonData={ws.comparisonData}
          comparisonMode={ws.comparisonMode}
          isLoading={ws.isLoading}
          currentStep={ws.currentStep}
          clarifications={ws.clarifications}
          understood={ws.understood}
          errorMessage={ws.errorMessage}
          isStale={ws.isStale}
          hasUnsavedChanges={ws.hasUnsavedChanges}
          activeDashboardDbId={ws.activeDashboardDbId}
          visibleSections={ws.visibleSections}
          preferredChartMode={ws.preferredChartMode}
          explanationNote={ws.explanationNote}
          renameDialogOpen={ws.renameDialogOpen}
          shareDialogOpen={ws.shareDialogOpen}
          onPromptSubmit={ws.handlePromptSubmit}
          onSelectTemplate={ws.handleSelectTemplate}
          onClarificationOption={ws.handleClarificationOption}
          onCancelClarification={() => ws.setClarifications(null)}
          onDismissError={() => ws.setErrorMessage(null)}
          onApplyFilter={ws.applyFilterChange}
          onToggleSection={ws.toggleSection}
          onRefresh={ws.handleRefresh}
          onSave={ws.handleSave}
          onOpenRename={() => ws.setRenameDialogOpen(true)}
          onCloseRename={() => ws.setRenameDialogOpen(false)}
          onConfirmRename={ws.handleRenameCurrent}
          onDuplicate={ws.handleDuplicateCurrent}
          onOpenShare={() => ws.setShareDialogOpen(true)}
          onCloseShare={() => ws.setShareDialogOpen(false)}
          onConfirmShare={ws.handleShareDashboard}
          onExportCsv={ws.exportCsv}
          onExportJson={ws.exportJson}
          onFollowUp={ws.handleFollowUp}
        />
      )}

      <SystemSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        systemStatus={ws.systemStatus}
        metrics={ws.approvedMetrics}
      />

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onGoStudio={() => ws.setCurrentView('studio')}
        onGoCanvas={() => ws.setCurrentView('canvas')}
        onGoSaved={() => ws.setCurrentView('dashboards')}
        onRunPrompt={(prompt, cmp) => ws.handlePromptSubmit(prompt, { compareEntities: cmp })}
        onOpenMetricCatalog={() => setCatalogOpen(true)}
      />

      <MetricCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </AppShell>
  );
}
