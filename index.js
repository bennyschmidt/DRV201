/* eslint-disable no-magic-numbers */

/*
 *
 * Decentralized Record of Value
 * DRV201: Non-Fungible Record (unique)
 *
 */

const { capitalizeSlug } = require('cryptography-utilities');

module.exports = ({ drv, peers, serviceEvents }) => {

  /*
   * Import DRV100 for its transfer logic.
   */

  const DRVContract = require('drv100')({
    drv,
    peers,
    serviceEvents
  });

  /*
   * Define a contract that: Accepts an encoded string as
   * the DRV value instead of a number, and if the `unique`
   * value of the transaction has not been assigned in any
   * previous transactions under DRV201, it creates a file,
   * populates it with the encoded content as formatted JSON,
   * then generates a user-friendly magnet link for distributed
   * access.
   */

  const Contract = async ({
    sender,
    recipient,
    recipientAddress,
    usdValue,
    drvValue = ''
  }) => {
    if (drvValue.substring(0, 9) !== 'data:drv/') return;

    const drvContent = drvValue.split(`;json`);
    const contentType = drvContent[0].replace(/data:drv\//, '');

    const content = drvValue.split(/data\:drv\/.*;json,/)[1];

    const { unique } = JSON.parse(content);

    if (!unique) return;

    const transactionsResult = await serviceEvents.onServiceGet({
      service: drv,
      serviceName: '/',
      method: 'transactions'
    });

    if (!transactionsResult?.success) return;

    let isUnique = true;

    await Promise.all(transactionsResult.body
      .filter(({ contract }) => contract === 'DRV201')
      .map(async transaction => {
        const mediaAddress = transaction.drvValue
          .replace(`::magnet:?xt=urn:drv/${contentType}:`, '')
          .replace(`&dn=${
            contentType.replace(contentType.charAt(0),
            contentType.charAt(0).toUpperCase())
          }`, '');

        const fileResult = await drv.onHttpPost(
          {
            method: 'search',
            body: {
              mediaAddress,
              mediaType: 'json'
            },
            route: {
              path: 'fs'
            },
            path: 'search'
          },
          {
            status: code => ({
              end: () => ({
                error: {
                  code,
                  message: '<DRV201> Contract error (POST).'
                }
              })
            }),
            send: body => ({
              status: 200,
              success: true,
              data: body
            })
          }
        );

        if (!fileResult?.success) return;

        const record = JSON.parse(
          fileResult?.data?.data || {}
        );

        if (record.unique === unique) {
          isUnique = false;
        }
      })
    );

    if (!isUnique) return;

    /*
     * Cache JSON records in DSS
     */

    const file = await drv.onHttpPost(
      {
        method: 'store',
        body: {
          content
        },
        route: {
          path: 'fs'
        },
        path: 'store'
      },
      {
        status: code => ({
          end: () => ({
            error: {
              code,
              message: '<DRV201> Contract error (POST).'
            }
          })
        }),
        send: body => ({
          status: 200,
          success: true,
          data: body
        })
      }
    );

    // TODO: Flatten nested `onHttpPost` responses
    const fileName = file.data.data.split('/')[1];

    // eslint-disable-next-line no-param-reassign
    drvValue = `::magnet:?xt=urn:drv/${contentType}:${fileName}&dn=${capitalizeSlug(contentType)}`;

    /*
     * Invoke the modified DRV100 with the encoded record.
     */

    return DRVContract({
      sender,
      recipient,
      recipientAddress,
      contract: 'DRV201',
      usdValue,
      drvValue,
      isDrv: true
    });
  };

  return Contract;
};
