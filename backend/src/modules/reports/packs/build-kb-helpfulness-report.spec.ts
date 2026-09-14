import { publishedArticleSeed } from '../../knowledge-base/published-article-seed';
import { buildKbHelpfulnessReport } from './build-kb-helpfulness-report';

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T00:00:00.000Z'),
};

describe('buildKbHelpfulnessReport', () => {
  it('tallies helpful votes in the window and sorts by net score', () => {
    const vpn = publishedArticleSeed({ id: 'kb-vpn', title: 'VPN' });
    const payroll = publishedArticleSeed({
      id: 'kb-pay',
      title: 'Payroll',
      organizationalUnitId: 'ou-hr',
    });
    const rows = buildKbHelpfulnessReport({
      window,
      tickets: [],
      csatByTicketId: new Map(),
      closeCodesById: new Map(),
      articles: [vpn, payroll],
      feedback: [
        { articleId: 'kb-vpn', isHelpful: true, createdAt: new Date('2026-09-05T00:00:00.000Z') },
        { articleId: 'kb-vpn', isHelpful: true, createdAt: new Date('2026-09-06T00:00:00.000Z') },
        { articleId: 'kb-vpn', isHelpful: false, createdAt: new Date('2026-09-07T00:00:00.000Z') },
        { articleId: 'kb-pay', isHelpful: true, createdAt: new Date('2026-08-01T00:00:00.000Z') },
      ],
    });
    expect(rows[0]).toMatchObject({
      articleId: 'kb-vpn',
      helpfulCount: 2,
      notHelpfulCount: 1,
      netScore: 1,
    });
    expect(rows[1]).toMatchObject({
      articleId: 'kb-pay',
      helpfulCount: 0,
      notHelpfulCount: 0,
      netScore: 0,
    });
  });
});
