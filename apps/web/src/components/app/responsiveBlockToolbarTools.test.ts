import { describe, expect, it } from 'vitest';
import {
  arrangeResponsiveBlockTools,
  BLOCK_TOOL_IDS,
} from './responsiveBlockToolbarTools';

describe('arrangeResponsiveBlockTools', () => {
  it('uses semantic ids with translated labels for layout classification', () => {
    const references = {
      id: BLOCK_TOOL_IDS.references,
      label: 'Ссылки',
    };
    const chat = { id: BLOCK_TOOL_IDS.chat, label: 'Чат' };
    const dispatch = {
      id: BLOCK_TOOL_IDS.dispatchToAgent,
      label: 'Отправить агенту',
    };
    const share = {
      id: BLOCK_TOOL_IDS.share,
      group: 'sharing',
      label: 'Поделиться',
    };
    const download = { id: 'download', label: 'Скачать' };

    expect(
      arrangeResponsiveBlockTools(
        [references, chat, dispatch, share, download],
        undefined
      )
    ).toEqual({
      headerTools: [share],
      toolbarTools: [download],
      fileMenuTools: [share, download],
    });
  });

  it('deduplicates a translated sharing tool by id or group', () => {
    const share = {
      id: BLOCK_TOOL_IDS.share,
      group: 'sharing',
      label: 'Поделиться',
    };
    const menuShare = {
      id: BLOCK_TOOL_IDS.share,
      group: 'sharing',
      label: 'Freigeben',
    };
    const ask = { id: 'ask-conation', label: 'Спросить Conation' };

    expect(
      arrangeResponsiveBlockTools([share], [ask, menuShare]).fileMenuTools
    ).toEqual([ask, menuShare]);
  });

  it('supports the sharing group as a label-independent compatibility fallback', () => {
    const groupedShare = { group: 'sharing', label: 'Общий доступ' };
    const groupedMenuShare = { group: 'sharing', label: 'Partager' };

    const arranged = arrangeResponsiveBlockTools(
      [groupedShare],
      [groupedMenuShare]
    );

    expect(arranged.headerTools).toEqual([groupedShare]);
    expect(arranged.fileMenuTools).toEqual([groupedMenuShare]);
  });

  it('never infers behavior from an English presentation label', () => {
    const labelOnlyTools: Array<{ label: string; id?: string }> = [
      { label: 'Share' },
      { label: 'Chat' },
      { label: 'Dispatch to Agent' },
      { label: 'References' },
    ];

    expect(arrangeResponsiveBlockTools(labelOnlyTools).toolbarTools).toEqual(
      labelOnlyTools
    );
  });
});
