import { formatNumber, t } from '@app/lib/i18n';
import { Accordion } from '@kobalte/core/accordion';
import { Scrollbars } from 'solid-custom-scrollbars';
import { createSignal, Index } from 'solid-js';
import { styled } from 'solid-styled-components';
import Reference from '../../model/Reference';
import type Term from '../../model/Term';
import { useTableOfContentsValue } from '../../store/tableOfContents';
import { OpenRefInNewTabIcon } from './OpenRefInNewTabIcon';
import {
  AccordionText,
  accordionCardStyles,
  accordionCollapseStyles,
  accordionHeadStyles,
} from './shared';

const BootstrapCard = styled.div`
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 2px;
`;

const DefinitionCount = styled.div`
  padding: 8px;
  font-size: 14px;
  font-weight: bold;
`;

interface IProps {
  term: Term;
}

export function ReferencesAccordion(props: IProps) {
  const tableOfContents = useTableOfContentsValue();
  const idToSectionMap = () => tableOfContents().idToSectionMap;

  const references = () =>
    Array.from(props.term.references).map((e) =>
      Reference.fromXML(e, {
        idToSectionMap: idToSectionMap(),
      })
    );

  const [expandedItem, setExpandedItem] = createSignal(['0']);

  return (
    <>
      <DefinitionCount>
        {t('pdf.definition.referenceCount', { count: references().length })}
      </DefinitionCount>
      <Scrollbars
        autoHide
        autoHideTimeout={1000}
        autoHideDuration={200}
        autoHeight
        autoHeightMin={0}
        autoHeightMax={300}
      >
        <Accordion value={expandedItem()} onChange={setExpandedItem}>
          <Index each={references()}>
            {(r, idx) => {
              const page = formatNumber(r().pageNum + 1);
              let text = t('pdf.definition.onPage', { page });
              if (r().sectionName) {
                text = t('pdf.definition.inSectionOnPage', {
                  section: r().sectionName ?? '',
                  page,
                });
              }
              return (
                <Accordion.Item value={idx.toString()}>
                  <BootstrapCard
                    class={'pinned-terms'}
                    style={accordionCardStyles}
                  >
                    <button
                      class="flex flex-row w-full justify-between"
                      style={accordionHeadStyles}
                      on:click={(e) => {
                        e.stopPropagation();
                        setExpandedItem([idx.toString()]);
                      }}
                    >
                      <AccordionText>{text}</AccordionText>
                      <OpenRefInNewTabIcon reference={r()} term={props.term} />
                    </button>
                    <Accordion.Content>
                      <div style={accordionCollapseStyles}>{r().context}</div>
                    </Accordion.Content>
                  </BootstrapCard>
                </Accordion.Item>
              );
            }}
          </Index>
        </Accordion>
      </Scrollbars>
    </>
  );
}
