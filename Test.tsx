<script>

    const engineeringAiPending = new Map();

    window.__engineeringAiResolve =
        function(requestId, rawResponse) {

            const pending =
                engineeringAiPending.get(requestId);

            if (!pending) {
                return;
            }

            engineeringAiPending.delete(requestId);

            try {

                const parsed =
                    typeof rawResponse === "string"
                        ? JSON.parse(rawResponse)
                        : rawResponse;

                if (
                    parsed &&
                    parsed.ok === false
                ) {

                    pending.reject(
                        new Error(
                            parsed.error ||
                            "Engineering AI bridge error"
                        )
                    );

                    return;
                }

                pending.resolve(
                    parsed && parsed.data !== undefined
                        ? parsed.data
                        : parsed
                );

            } catch (e) {

                pending.reject(e);
            }
        };


    window.__engineeringAiReject =
        function(requestId, message) {

            const pending =
                engineeringAiPending.get(requestId);

            if (!pending) {
                return;
            }

            engineeringAiPending.delete(requestId);

            pending.reject(
                new Error(
                    message ||
                    "Engineering AI bridge error"
                )
            );
        };


    window.intellijBridge = {

        request: function(obj) {

            return new Promise(
                function(resolve, reject) {

                    const requestId =
                        crypto.randomUUID
                            ? crypto.randomUUID()
                            : Date.now()
                                + "-"
                                + Math.random();

                    engineeringAiPending.set(
                        requestId,
                        {
                            resolve: resolve,
                            reject: reject
                        }
                    );

                    const wrapper = {
                        requestId: requestId,
                        request: obj || {}
                    };

                    const payload =
                        JSON.stringify(wrapper);

                    try {

                        window.__engineeringAiSend(
                            payload
                        );

                    } catch (e) {

                        engineeringAiPending.delete(
                            requestId
                        );

                        reject(e);
                    }
                }
            );
        }
    };

    /*__JAVA_BRIDGE__*/

</script>
