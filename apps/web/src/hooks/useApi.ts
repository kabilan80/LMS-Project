import { useCallback, useRef, useState } from 'react';
import { getErrorMessage, getFieldErrors } from '../services/api';
import { log } from '../utils/log';

/**
 * One hook for every API call. Pages never call a service directly: they hand it to useApi and call `callAPI`.
 *
 *   const { data: courses, loading: coursesLoading, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);
 *   const { loading: createLoading, error: createError, callAPI: createCourseAPI } = useApi(createCourse);
 *   useEffect(() => { getCoursesAPI(params).catch(() => undefined); }, [params]);   // read on load / when params change
 *   const id = await createCourseAPI(input);                                         // write on click (wrap in try/catch)
 *
 * - `callAPI` resolves with the service result and THROWS on failure (the error message is also put in `error`).
 * - `error` is the server's message (or a generic one); `fieldErrors` holds per-field messages from a 422.
 * - `loaded` turns true once the first call has finished, so a list page can show a loader instead of "empty".
 * - If calls overlap (e.g. quick filter changes) only the latest one updates `data`.
 */
const useApi = <TArgs extends unknown[], TResult>(service: (...args: TArgs) => Promise<TResult>) => {
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const latest = useRef(0);
  const [data, setData] = useState<TResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const callAPI = useCallback(async (...args: TArgs): Promise<TResult> => {
    const id = ++latest.current;
    try {
      setLoading(true);
      setError(null);
      setFieldErrors({});
      log('useApi', `calling ${serviceRef.current.name || 'service'}`, args);
      const result = await serviceRef.current(...args);
      log('useApi', `${serviceRef.current.name || 'service'} finished`, result);
      if (id === latest.current) setData(result);
      return result;
    } catch (e) {
      log('useApi', `${serviceRef.current.name || 'service'} FAILED: ${getErrorMessage(e)}`);
      if (id === latest.current) {
        setError(getErrorMessage(e));
        setFieldErrors(getFieldErrors(e));
      }
      throw e;
    } finally {
      if (id === latest.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setFieldErrors({});
  }, []);

  return { data, loading, loaded, error, fieldErrors, callAPI, reset, setError, setData };
};

export { useApi };
export default useApi;
